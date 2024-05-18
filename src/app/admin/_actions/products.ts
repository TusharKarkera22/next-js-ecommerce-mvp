"use server"

import db from "@/db/db"
import { z } from "zod"
import fs from "fs/promises"
import { notFound, redirect } from "next/navigation"
import { revalidatePath } from "next/cache"

const fileSchema = z.instanceof(File, { message: "Required" })
const imageSchema = fileSchema.refine(
  file => file.size === 0 || file.type.startsWith("image/")
)

const addSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  priceInCents: z.coerce.number().int().min(1),
  file: fileSchema.refine(file => file.size > 0, "Required"),
  image: imageSchema.refine(file => file.size > 0, "Required"),
})

export async function addProduct(prevState: unknown, formData: FormData) {
  const result = addSchema.safeParse(Object.fromEntries(formData.entries()))
  console.log("Validation Result:", result)
  if (result.success === false) {
    return result.error.formErrors.fieldErrors
  }

  const data = result.data
  console.log("Parsed Data:", data)

  await fs.mkdir("products", { recursive: true })
  const filePath = `products/${crypto.randomUUID()}-${data.file.name}`
  console.log("File Path:", filePath)
  await fs.writeFile(filePath, Buffer.from(await data.file.arrayBuffer()))

  await fs.mkdir("public/products", { recursive: true })
  const imagePath = `/products/${crypto.randomUUID()}-${data.image.name}`
  console.log("Image Path:", imagePath)
  await fs.writeFile(
    `public${imagePath}`,
    Buffer.from(await data.image.arrayBuffer())
  )

  await db.product.create({
    data: {
      isAvailableForPurchase: false,
      name: data.name,
      description: data.description,
      priceInCents: data.priceInCents,
      filePath,
      imagePath,
    },
  })
  console.log("Product Created")

  revalidatePath("/")
  revalidatePath("/products")

  redirect("/admin/products")
}

const editSchema = addSchema.extend({
  file: fileSchema.optional(),
  image: imageSchema.optional(),
})

export async function updateProduct(
  id: string,
  prevState: unknown,
  formData: FormData
) {
  try {
    const result = editSchema.safeParse(Object.fromEntries(formData.entries()))
    console.log("Validation Result:", result)
    if (result.success === false) {
      return result.error.formErrors.fieldErrors
    }

    const data = result.data
    const product = await db.product.findUnique({ where: { id } })
    console.log("Existing Product:", product)

    if (product == null) return notFound()

    let filePath = product.filePath
    if (data.file != null && data.file.size > 0) {
      await fs.unlink(product.filePath)
      filePath = `products/${crypto.randomUUID()}-${data.file.name}`
      await fs.writeFile(filePath, Buffer.from(await data.file.arrayBuffer()))
    }

    let imagePath = product.imagePath
    if (data.image != null && data.image.size > 0) {
      await fs.unlink(`public${product.imagePath}`)
      imagePath = `/products/${crypto.randomUUID()}-${data.image.name}`
      await fs.writeFile(
        `public${imagePath}`,
        Buffer.from(await data.image.arrayBuffer())
      )
    }

    await db.product.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description,
        priceInCents: data.priceInCents,
        filePath,
        imagePath,
      },
    })
    console.log("Product Updated")

    revalidatePath("/")
    revalidatePath("/products")

    redirect("/admin/products")
  } catch (error) {
    console.error("Error in updateProduct:", error)
    throw error
  }
}


export async function toggleProductAvailability(
  id: string,
  isAvailableForPurchase: boolean
) {
  await db.product.update({ where: { id }, data: { isAvailableForPurchase } })
  console.log("Product Availability Toggled")

  revalidatePath("/")
  revalidatePath("/products")
}

export async function deleteProduct(id: string) {
  const product = await db.product.delete({ where: { id } })
  console.log("Product Deleted:", product)

  if (product == null) return notFound()

  await fs.unlink(product.filePath)
  await fs.unlink(`public${product.imagePath}`)

  revalidatePath("/")
  revalidatePath("/products")
}
