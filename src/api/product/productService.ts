import type { Readable } from "node:stream";
import type { ProductTypeEnum } from "@/common/enums/product/productTypeEnum";
import { AwsService } from "@/common/libs/awsService";
import { ServiceResponse } from "@/common/models/serviceResponse";
import { generateBarcode } from "@/common/utils/bwipService";
import { exportData } from "@/common/utils/dataExporter";
import { importData } from "@/common/utils/dataImporter";
import { env } from "@/common/utils/envConfig";
import { prismaClient } from "@/config/prisma";
import { StatusCodes } from "http-status-codes";
import chunk from "lodash.chunk";
import type {
  Prisma,
  ProductDiscount,
  ProductDiscountTypes,
} from "../../../generated/prisma";
import type {
  CreateProductType,
  DeleteProductManyType,
  Product,
  RequestQueryProductType,
  UpdateProductType,
} from "./productModel";

type VariantFieldType = {
  size: string[];
  color: string[];
  sku: string[];
  imageUrl: string[];
  stock: number[];
  buy: number[];
  member: number[];
  normal: number[];
  reseller: number[];
  agent: number[];
};

class ProductService {
  private readonly awsService;

  constructor(
    initAws = new AwsService({
      cloudCubeAccessKey: env.CLOUDCUBE_ACCESS_KEY,
      cloudCubeBucket: env.CLOUDCUBE_BUCKET,
      cloudCubeRegion: env.CLOUDCUBE_REGION,
      cloudCubeSecretKey: env.CLOUDCUBE_SECRET_KEY,
      cloudCubeUrl: env.CLOUDCUBE_URL,
    })
  ) {
    this.awsService = initAws;
  }

  public getAllProducts = async (query: RequestQueryProductType) => {
    try {
      const {
        page: rawPage = 1,
        limit: rawLimit = 10,
        type,
        categoryId,
        productDiscountId,
        sort,
        order,
        productPrice,
        startDate,
        endDate,
        month,
        week,
        search,
        year,
      } = query;
      const page = Number(rawPage) || 1;
      const limit = Number(rawLimit) || 10;
      const skip = (page - 1) * limit;
      const queryArgs: Prisma.ProductFindManyArgs = {};
      const sortableFields = ["createdAt", "name", "email"];
      console.log(query.search);

      if (sort && sortableFields.includes(sort)) {
        queryArgs.orderBy = {
          [sort]: order,
        };
      } else {
        queryArgs.orderBy = {
          createdAt: "asc",
        };
      }

      const createdAt: { gte?: Date; lte?: Date; lt?: Date } = {};

      if (startDate && endDate) {
        createdAt.gte = new Date(`${startDate}T00:00:00`);
        createdAt.lte = new Date(`${endDate}T23:59:59`);
      }

      if (month) {
        const monthNumber = Number.parseInt(month, 10);
        const yearNumber = year
          ? Number.parseInt(year, 10)
          : new Date().getFullYear();

        createdAt.gte = new Date(yearNumber, monthNumber - 1, 1);
        createdAt.lte = new Date(yearNumber, monthNumber, 0, 23, 59, 59);
      }

      if (year && !month && !week) {
        const yearNumber = Number.parseInt(year, 10);

        createdAt.gte = new Date(yearNumber, 0, 1);
        createdAt.lt = new Date(yearNumber + 1, 0, 1);
      }

      if (week) {
        const weekNumber = Number.parseInt(week, 10);
        const yearNumber = year
          ? Number.parseInt(year, 10)
          : new Date().getFullYear();

        const janFirst = new Date(yearNumber, 0, 1);
        const daysToAdd = (weekNumber - 1) * 7;

        const weekStart = new Date(janFirst);
        weekStart.setDate(janFirst.getDate() + daysToAdd);

        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);

        createdAt.gte = weekStart;
        createdAt.lte = new Date(weekEnd.setHours(23, 59, 59));
      }

      const searchTerms = search
        ?.trim()
        .toLowerCase()
        .split(/\s+/)
        .filter((term) => term.length > 0);
      // biome-ignore lint/style/noNonNullAssertion: <explanation>
      if (searchTerms!.length > 0) {
        const searchConditions = searchTerms?.map((term) => ({
          OR: [
            {
              name: {
                contains: term,
                mode: "insensitive" as const,
              },
            },
            {
              productVariants: {
                some: {
                  sku: {
                    contains: term,
                    mode: "insensitive" as const,
                  },
                },
              },
            },
          ],
        }));

        queryArgs.where = {
          ...queryArgs.where,
          AND: searchConditions,
        };
      }

      if (type) {
        queryArgs.where = {
          ...queryArgs.where,
          type,
        };
      }

      if (categoryId) {
        queryArgs.where = {
          ...queryArgs.where,
          categoryId,
        };
      }

      if (productDiscountId) {
        queryArgs.where = {
          ...queryArgs.where,
          ProductDiscount: {
            some: {
              id: productDiscountId,
            },
          },
        };
      }

      if (productPrice) {
        queryArgs.where = {
          ...queryArgs.where,
          productVariants: {
            some: {
              productPrices: {
                some: {
                  ...(productPrice.normal && {
                    normal: {
                      ...(productPrice.normal.min && {
                        gte: productPrice.normal.min,
                      }),
                      ...(productPrice.normal.max && {
                        lte: productPrice.normal.max,
                      }),
                    },
                  }),
                  ...(productPrice.buy && {
                    buy: {
                      ...(productPrice.buy.min && {
                        gte: productPrice.buy.min,
                      }),
                      ...(productPrice.buy.max && {
                        lte: productPrice.buy.max,
                      }),
                    },
                  }),
                  ...(productPrice.reseller && {
                    reseller: {
                      ...(productPrice.reseller.min && {
                        gte: productPrice.reseller.min,
                      }),
                      ...(productPrice.reseller.max && {
                        lte: productPrice.reseller.max,
                      }),
                    },
                  }),
                  ...(productPrice.agent && {
                    agent: {
                      ...(productPrice.agent.min && {
                        gte: productPrice.agent.min,
                      }),
                      ...(productPrice.agent.max && {
                        lte: productPrice.agent.max,
                      }),
                    },
                  }),
                  ...(productPrice.member && {
                    member: {
                      ...(productPrice.member.min && {
                        gte: productPrice.member.min,
                      }),
                      ...(productPrice.member.max && {
                        lte: productPrice.member.max,
                      }),
                    },
                  }),
                },
              },
            },
          },
        };
      }

      const [products, total] = await Promise.all([
        prismaClient().product.findMany({
          ...queryArgs,
          skip,
          take: limit,
          orderBy: {
            createdAt: "desc", // Mengurutkan berdasarkan data terbaru (descending)
          },
          include: {
            category: true,
            productVariants: {
              include: {
                productPrices: true,
              },
            },
          },
        }),
        prismaClient().product.count(),
      ]);

      // biome-ignore lint/suspicious/noExplicitAny: <explanation>
      const newProduct = products.flatMap((prod: any) =>
        // biome-ignore lint/suspicious/noExplicitAny: <explanation>
        prod.productVariants.map((variant: any) => {
          const { productVariants, ...restProduct } = prod;
          return {
            product: restProduct,
            variant: productVariants,
            price: variant.productPrices[0],
          };
        })
      );

      const response: PaginatedResponse<Product> = {
        data: newProduct as unknown as Product[],
        meta: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalItems: total,
        },
      };

      return ServiceResponse.success(
        "Products retrieved successfully.",
        response,
        StatusCodes.OK
      );
    } catch (ex) {
      const errorMessage = `Error get all products: ${(ex as Error).message}`;
      return ServiceResponse.failure(
        "An error occurred while get all products.",
        errorMessage,
        StatusCodes.INTERNAL_SERVER_ERROR
      );
    }
  };

  public getDetailProduct = async (productId: string) => {
    try {
      const foundProduct = await prismaClient().product.findUnique({
        where: { id: productId },
        include: {
          category: true,
          ProductDiscount: true,
          productVariants: {
            include: {
              productPrices: true,
            },
          },
        },
      });
      if (!foundProduct) {
        return ServiceResponse.failure(
          "Product is not exist.",
          null,
          StatusCodes.NOT_FOUND
        );
      }

      return ServiceResponse.success(
        "Product retrieved successfully.",
        foundProduct,
        StatusCodes.OK
      );
    } catch (ex) {
      const errorMessage = `Error get all products: ${(ex as Error).message}`;
      return ServiceResponse.failure(
        "An error occurred while get all products.",
        errorMessage,
        StatusCodes.INTERNAL_SERVER_ERROR
      );
    }
  };

  public createProduct = async (
    req: CreateProductType,
    files: Express.Multer.File[]
  ) => {
    // Check if product with the same name already exists
    const foundProduct = await prismaClient().product.findFirst({
      where: {
        OR: [
          {
            name: req.product.name,
          },
          {
            productVariants: {
              some: {
                sku: {
                  in: req.productVariants.map((variant) => variant.sku),
                },
              },
            },
          },
        ],
      },
    });

    // check if found product
    if (foundProduct) {
      return ServiceResponse.failure(
        "Product already exists",
        null,
        StatusCodes.BAD_REQUEST
      );
    }

    const foundCategory = await prismaClient().category.findFirst({
      where: {
        id: req.product.categoryId,
      },
    });
    if (!foundCategory) {
      return ServiceResponse.failure(
        "Category is not found",
        null,
        StatusCodes.NOT_FOUND
      );
    }

    // Validate pricing: purchase price must be less than normal and reseller prices
    const hasInvalidPrice = req.productVariants?.some(({ productPrices }) => {
      const buy = productPrices?.buy;
      const normal = productPrices?.normal;
      const reseller = productPrices?.reseller;
      return (
        (buy && normal && buy >= normal) || (buy && reseller && buy > reseller)
      );
    });

    if (hasInvalidPrice) {
      return ServiceResponse.failure(
        "The purchase price cannot be greater than the normal or reseller price.",
        null,
        StatusCodes.BAD_REQUEST
      );
    }

    try {
      let newProduct: Partial<Product> = {};
      // Use transaction to ensure data consistency across related tables
      await prismaClient().$transaction(
        async (tx: Prisma.TransactionClient) => {
          // Generate barcode
          let barcodeUrl: string | null = null;
          if (req.product?.name) {
            const barcodeBuffer = await generateBarcode(req.product.name);
            if (barcodeBuffer) {
              const barcodeFile: Express.Multer.File = {
                fieldname: "barcode",
                originalname: `${req.product.name}-barcode.png`,
                encoding: "7bit",
                mimetype: "image/png",
                size: barcodeBuffer.length,
                buffer: barcodeBuffer,
                destination: "",
                filename: "",
                path: "",
                stream: {} as unknown as Readable,
              };
              barcodeUrl = await this.awsService.uploadFile(barcodeFile);
            }
          }

          // Upload new images
          const imageUrls: (string | null)[] = [];
          if (req.productVariants?.length && files.length > 0) {
            for (let i = 0; i < req.productVariants.length; i++) {
              if (files[i]) {
                const uploadedUrl = await this.awsService.uploadFile(files[i]);
                imageUrls.push(uploadedUrl);
              } else {
                imageUrls.push(null);
              }
            }
          } else {
            imageUrls.push(
              ...Array(req.productVariants?.length || 0).fill(null)
            );
          }

          console.log(req.product.categoryId);

          const { categoryId, ...productDataWithoutCategoryId } = req.product;

          const createDataProduct: Prisma.ProductCreateInput = {
            ...productDataWithoutCategoryId,
            isPublish: Boolean(req.product.isPublish),
            category: categoryId ? { connect: { id: categoryId } } : undefined,
            ProductDiscount: req.productDiscount
              ? { create: req.productDiscount }
              : undefined,
          };

          // Create the main product record
          newProduct = (await tx.product.create({
            data: {
              ...createDataProduct,
              ProductDiscount: { create: req.productDiscount ?? undefined },
            },
          })) as Product;

          // Create all product variants in parallel for better performance
          await Promise.all(
            req.productVariants.map(async (variant, index) => {
              const { productPrices, ...rest } = variant;
              return tx.productVariant.create({
                data: {
                  ...rest,
                  imageUrl: imageUrls[index],
                  barcode: barcodeUrl,
                  product: {
                    connect: {
                      id: newProduct.id,
                    },
                  },
                  // Create related pricing information
                  productPrices: productPrices
                    ? { create: productPrices }
                    : undefined,
                },
              });
            })
          );
        }
      );

      return ServiceResponse.success(
        "Product created successfully.",
        newProduct,
        StatusCodes.CREATED
      );
    } catch (ex) {
      const errorMessage = `Error creating product: ${(ex as Error).message}`;
      return ServiceResponse.failure(
        "An error occurred while creating product.",
        errorMessage,
        StatusCodes.INTERNAL_SERVER_ERROR
      );
    }
  };

  public updateProduct = async (
    req: UpdateProductType,
    productId: string,
    files: Express.Multer.File[]
  ) => {
    try {
      // Verify product exists before attempting update
      const existingProduct = await prismaClient().product.findUnique({
        where: { id: productId },
        include: {
          productVariants: true,
        },
      });
      console.log(existingProduct);

      if (!existingProduct) {
        return ServiceResponse.failure(
          "Product not found",
          null,
          StatusCodes.NOT_FOUND
        );
      }

      // Validate pricing rules for all variants
      const hasInvalidPrice = req.productVariants?.some(({ productPrices }) => {
        const buy = productPrices?.buy;
        const normal = productPrices?.normal;
        const reseller = productPrices?.reseller;
        return (
          (buy && normal && buy >= normal) ||
          (buy && reseller && buy > reseller)
        );
      });
      if (hasInvalidPrice) {
        return ServiceResponse.failure(
          "The purchase price cannot be greater than the normal or reseller price.",
          null,
          StatusCodes.BAD_REQUEST
        );
      }

      // await Promise.all(
      // 	existingProduct.productVariants.flatMap((variant) => {
      // 		const tasks = [];
      // 		if (variant.imageUrl) {
      // 			const imageKey = this.awsService.extractKeyFromUrl(variant.imageUrl);
      // 			tasks.push(this.awsService.deleteFile(imageKey));
      // 		}
      // 		if (variant.barcode) {
      // 			const barcodeKey = this.awsService.extractKeyFromUrl(variant.barcode);
      // 			tasks.push(this.awsService.deleteFile(barcodeKey));
      // 		}

      // 		return tasks;
      // 	}),
      // );

      // Generate barcode
      // let barcodeUrl: string | null = null;
      // if (req.product?.name) {
      // 	const barcodeBuffer = await generateBarcode(req.product.name);
      // 	if (barcodeBuffer) {
      // 		const barcodeFile: Express.Multer.File = {
      // 			fieldname: "barcode",
      // 			originalname: `${req.product.name}-barcode.png`,
      // 			encoding: "7bit",
      // 			mimetype: "image/png",
      // 			size: barcodeBuffer.length,
      // 			buffer: barcodeBuffer,
      // 			destination: "",
      // 			filename: "",
      // 			path: "",
      // 			stream: {} as unknown as Readable,
      // 		};
      // 		barcodeUrl = await this.awsService.uploadFile(barcodeFile);
      // 	}
      // }

      // TODO: Upload new images
      // const imageUrls: (string | null)[] = [];
      // if (req.productVariants?.length && files.length > 0) {
      // 	for (let i = 0; i < req.productVariants.length; i++) {
      // 		if (files[i]) {
      // 			const uploadedUrl = await this.awsService.uploadFile(files[i]);
      // 			imageUrls.push(uploadedUrl);
      // 		} else {
      // 			imageUrls.push(null);
      // 		}
      // 	}
      // } else {
      // 	imageUrls.push(...Array(req.productVariants?.length || 0).fill(null));
      // }

      let responseData: Product;
      // Use transaction to ensure data consistency during update
      await prismaClient().$transaction(
        async (tx: Prisma.TransactionClient) => {
          // Update main product information
          responseData = (await tx.product.update({
            where: { id: productId },
            data: {
              ...req.product,
              category: req.categoryId
                ? { connect: { id: req.categoryId } }
                : undefined,
              ProductDiscount: req.productDiscount?.id
                ? {
                    update: {
                      where: { id: req.productDiscount.id },
                      data: req.productDiscount,
                    },
                  }
                : undefined,
            },
          })) as Product;

          if (req.productVariants?.length) {
            // Update existing variants or create new ones
            await Promise.all(
              (req.productVariants ?? []).map(async (variant, index) => {
                const { id, productPrices, ...rest } = variant;

                if (id) {
                  // Update existing variant
                  await tx.productVariant.update({
                    where: { id },
                    data: {
                      ...rest,
                      barcode:
                        "https://ik.imagekit.io/vieryn/Albana/ALBANA%20PRODUCT.png?updatedAt=1756954124902",
                      imageUrl:
                        "https://ik.imagekit.io/vieryn/Albana/ALBANA%20PRODUCT.png?updatedAt=1756954124902",
                      // Update pricing information
                      productPrices: productPrices?.id
                        ? ({
                            update: {
                              where: { id: productPrices.id },
                              data: productPrices,
                            },
                          } as unknown as Prisma.ProductPriceUncheckedUpdateManyWithoutProductVariantNestedInput)
                        : undefined,
                    },
                  });
                } else {
                  // Create new variant
                  await tx.productVariant.create({
                    data: {
                      ...rest,
                      barcode:
                        "https://ik.imagekit.io/vieryn/Albana/ALBANA%20PRODUCT.png?updatedAt=1756954124902",
                      imageUrl:
                        "https://ik.imagekit.io/vieryn/Albana/ALBANA%20PRODUCT.png?updatedAt=1756954124902",
                      productPrices: productPrices
                        ? { create: productPrices }
                        : undefined,
                    },
                  });
                }
              })
            );
          }
        }
      );

      return ServiceResponse.success(
        "Product updated successfully.",
        existingProduct,
        StatusCodes.OK
      );
    } catch (ex) {
      const errorMessage = `Error updating product: ${(ex as Error).message}`;
      return ServiceResponse.failure(
        "An error occurred while updating product.",
        errorMessage,
        StatusCodes.INTERNAL_SERVER_ERROR
      );
    }
  };

  public deleteProduct = async (
    productId: string,
    req: DeleteProductManyType
  ) => {
    try {
      let foundProducts: Partial<Product>[];

      // Helper to check if any product is used in orderProduct
      const isProductUsedInOrderProduct = async (productIds: string[]) => {
        const used = await prismaClient().orderProduct.findFirst({
          where: {
            productId: {
              in: productIds,
            },
          },
        });
        return !!used;
      };

      if (req && Array.isArray(req.productIds) && req.productIds?.length > 0) {
        // Delete multiple products
        foundProducts = (await prismaClient().product.findMany({
          where: { id: { in: req.productIds } },
        })) as unknown as Product[];

        if (!foundProducts.length) {
          return ServiceResponse.failure(
            "Products not found.",
            null,
            StatusCodes.NOT_FOUND
          );
        }

        // Check if any of the products are used in orderProduct
        const used = await isProductUsedInOrderProduct(req.productIds);
        if (used) {
          return ServiceResponse.failure(
            "Cannot delete product(s) because one or more are used in orderProduct.",
            null,
            StatusCodes.BAD_REQUEST
          );
        }

        await prismaClient().product.deleteMany({
          where: { id: { in: req.productIds } },
        });
      } else {
        const product = await prismaClient().product.findFirst({
          where: { id: productId },
        });

        if (!product) {
          return ServiceResponse.failure(
            "Product not found.",
            null,
            StatusCodes.NOT_FOUND
          );
        }

        foundProducts = [product as Product];

        // Check if the product is used in orderProduct
        const used = await isProductUsedInOrderProduct([productId]);
        if (used) {
          return ServiceResponse.failure(
            "Cannot delete product because it is used in orderProduct.",
            null,
            StatusCodes.BAD_REQUEST
          );
        }

        await prismaClient().product.delete({
          where: { id: productId },
        });
      }

      return ServiceResponse.success(
        "Product deleted successfully.",
        foundProducts,
        StatusCodes.OK
      );
    } catch (ex) {
      const errorMessage = `Error deleting product: ${(ex as Error).message}`;
      return ServiceResponse.failure(
        "An error occurred while deleting product.",
        errorMessage,
        StatusCodes.INTERNAL_SERVER_ERROR
      );
    }
  };

  public exportProducts = async (query: RequestQueryProductType) => {
    try {
      const formatter = new Intl.DateTimeFormat("id-ID", {
        timeZone: "Asia/Jakarta",
        dateStyle: "short",
      });

      const exportParams = {
        ...query,
        startDate: query.startDate?.toISOString().split("T")[0],
        endDate: query.endDate?.toISOString().split("T")[0],
      };

      return exportData<
        Prisma.ProductGetPayload<{
          include: {
            productVariants: {
              include: {
                productPrices: true;
              };
            };
            category: true;
            ProductDiscount: true;
          };
        }>
      >(
        exportParams,
        async (where) => {
          const products = await prismaClient().product.findMany({
            where: where as Prisma.ProductWhereInput,
            orderBy: { createdAt: "desc" },
            include: {
              productVariants: {
                include: {
                  productPrices: true,
                },
              },
              category: true,
              ProductDiscount: true,
            },
          });

          return products.map((product) => ({
            ...product,
            name: product.name || "",
            description: product.description || "",
            type: product.type as unknown as ProductTypeEnum,
            isPublish: product.isPublish || false,
            weight: product.weight || 0,
          }));
        },
        (product, index) => {
          const variantFields = product.productVariants.reduce(
            (acc, v) => {
              acc.size.push(v.size as string);
              acc.color.push(v.color as string);
              acc.sku.push(v.sku as string);
              acc.imageUrl.push(v.imageUrl as string);
              acc.stock.push(v.stock as number);
              const buys =
                v.productPrices
                  ?.map((p) => p.buy)
                  .filter((b): b is number => b !== null) ?? [];
              acc.buy.push(...buys);
              const members =
                v.productPrices
                  ?.map((p) => p.member)
                  .filter((b): b is number => b !== null) ?? [];
              acc.member.push(...members);
              const agents =
                v.productPrices
                  ?.map((p) => p.agent)
                  .filter((b): b is number => b !== null) ?? [];
              acc.agent.push(...agents);
              const normals =
                v.productPrices
                  ?.map((p) => p.normal)
                  .filter((b): b is number => b !== null) ?? [];
              acc.normal.push(...normals);
              const resellers =
                v.productPrices
                  ?.map((p) => p.reseller)
                  .filter((b): b is number => b !== null) ?? [];
              acc.reseller.push(...resellers);
              return acc;
            },
            {
              size: [],
              color: [],
              sku: [],
              imageUrl: [],
              stock: [],
              buy: [],
              member: [],
              agent: [],
              normal: [],
              reseller: [],
            } as VariantFieldType
          );

          return {
            No: index + 1,
            "Nama Produk": product.name ?? null,
            Kategori: product.category?.name ?? null,
            Size: variantFields.size.join(", ") ?? null,
            Warna: variantFields.color.join(", ") ?? null,
            Deskripsi: product.description ?? null,
            SKU: variantFields.sku.join(", ") ?? null,
            Gambar: variantFields.imageUrl ?? null,
            "Harga Beli (Harga Modal)": variantFields.buy.join(", ") ?? null,
            "Harga Jual": variantFields.normal.join(", ") ?? null,
            "Harga Member": variantFields.member.join(", ") ?? null,
            "Harga Agent": variantFields.agent.join(", ") ?? null,
            "Harga Reseller": variantFields.reseller.join(", ") ?? null,
            "Jumlah Stok": variantFields.stock.join(", ") ?? null,
            "Diskon Produk": product.ProductDiscount.map(
              (discount: ProductDiscount) => discount.value
            ).join(","),
            "Tipe Diskon": product.ProductDiscount.map(
              (discount: ProductDiscount) => discount.type
            ).join(","),
            "Berat (gram)": product.weight ?? null,
          };
        },
        "Produk",
        "Tidak ada data produk untuk di ekspor."
      );
    } catch (ex) {
      const errorMessage = `Error exporting product: ${(ex as Error).message}`;
      return ServiceResponse.failure(
        "An error occurred while exporting product.",
        errorMessage,
        StatusCodes.INTERNAL_SERVER_ERROR
      );
    }
  };

  public importProducts = async (file: Buffer) => {
    try {
      const importResult = await importData<Prisma.ProductCreateInput>(
        file,
        (row) => {
          const categoryName = row.Kategori as string | undefined;
          const hasPrice =
            row["Harga Jual"] ||
            row["Harga Member"] ||
            row["Harga Reseller"] ||
            row["Harga Beli (Harga Modal)"] ||
            row["Harga Agent"];
          const hasVariant =
            row.SKU ||
            row.Gambar ||
            row.Size ||
            row.Warna ||
            row["Jumlah Stok"];
          const hasDiscount = row["Diskon Produk"] || row["Tipe Diskon"];

          let productVariantData:
            | Prisma.ProductVariantCreateWithoutProductInput
            | undefined = undefined;

          if (hasVariant) {
            productVariantData = {
              sku: row.SKU ? String(row.SKU) : null,
              imageUrl: row.Gambar ? String(row.Gambar).trim() : null,
              size: row.Size ? String(row.Size) : null,
              color: row.Warna ? String(row.Warna) : null,
              stock: row["Jumlah Stok"] ? Number(row["Jumlah Stok"]) : null,
              barcode: null,
              productPrices: hasPrice
                ? {
                    create: {
                      normal: row["Harga Jual"]
                        ? Number(row["Harga Jual"])
                        : null,
                      member: row["Harga Member"]
                        ? Number(row["Harga Member"])
                        : null,
                      reseller: row["Harga Reseller"]
                        ? Number(row["Harga Reseller"])
                        : null,
                      buy: row["Harga Beli (Harga Modal)"]
                        ? Number(row["Harga Beli (Harga Modal)"])
                        : null,
                      agent: row["Harga Agent"]
                        ? Number(row["Harga Agent"])
                        : null,
                    },
                  }
                : undefined,
            };
          }

          const productData: Prisma.ProductCreateInput = {
            name: row["Nama Produk"] ? String(row["Nama Produk"]) : null,
            category: categoryName
              ? {
                  connectOrCreate: {
                    create: { name: categoryName },
                    where: { name: categoryName },
                  },
                }
              : undefined,
            description: row.Deskripsi ? String(row.Deskripsi) : null,
            weight: row["Berat (gram)"] ? Number(row["Berat (gram)"]) : null,
            productVariants: productVariantData
              ? {
                  create: productVariantData,
                }
              : undefined,
            ProductDiscount: hasDiscount
              ? {
                  create: {
                    value: row["Diskon Produk"]
                      ? Number(row["Diskon Produk"])
                      : null,
                    type: row["Tipe Diskon"]
                      ? (row["Tipe Diskon"] as ProductDiscountTypes)
                      : null,
                  },
                }
              : undefined,
          };

          console.log(productVariantData);

          return productData;
        },
        async (data) => {
          const BATCH_SIZE = 100;
          const batches = chunk(data, BATCH_SIZE);
          for (const batch of batches) {
            await Promise.all(
              batch.map((product) =>
                prismaClient().product.create({
                  data: product,
                  include: {
                    productVariants: {
                      include: {
                        productPrices: true,
                      },
                    },
                    category: true,
                    ProductDiscount: true,
                  },
                })
              )
            );
          }
        }
      );

      return ServiceResponse.success(
        "Berhasil mengimpor data product",
        importResult.responseObject?.length,
        StatusCodes.OK
      );
    } catch (ex) {
      const errorMessage = `Error exporting product: ${(ex as Error).message}`;
      return ServiceResponse.failure(
        "An error occurred while exporting product.",
        errorMessage,
        StatusCodes.INTERNAL_SERVER_ERROR
      );
    }
  };
}

export const productService = new ProductService();
