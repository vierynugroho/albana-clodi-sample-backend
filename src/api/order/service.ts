import { ServiceResponse } from "@/common/models/serviceResponse";
import type { OrderWithRelations } from "@/common/types/orderExport";
import { exportData } from "@/common/utils/dataExporter";
import { importData } from "@/common/utils/dataImporter";
import { prismaClient } from "@/config/prisma";
import { logger } from "@/server";
import { StatusCodes } from "http-status-codes";
import { v4 as uuidv4 } from "uuid";
import { type CustomerCategories, PaymentStatus, type Prisma } from "../../../generated/prisma";
import type { CreateOrderType, OrderQueryType, UpdateOrderType } from "./model";

interface GetAllOrdersParams {
	startDate?: string;
	endDate?: string;
	month?: string;
	year?: string;
	week?: string;
}

class OrderService {
	public getAll = async (query: OrderQueryType["query"]) => {
		try {
      type OrderFilter = Prisma.OrderWhereInput;

      const filter: OrderFilter = {};

      const queryParams = {
        salesChannelId: query.salesChannelId as string | undefined,
        customerCategory: query.customerCategory as string | undefined,
        paymentStatus: query.paymentStatus as PaymentStatus | undefined,
        productId: query.productId as string | undefined,
        paymentMethodId: query.paymentMethodId as string | undefined,
        orderDate: query.orderDate as string | undefined,
        orderMonth: query.orderMonth as string | undefined,
        orderYear: query.orderYear as string | undefined,
        startDate: query.startDate as string | undefined,
        endDate: query.endDate as string | undefined,
        unavailableReceipt: query.unavailableReceipt as "yes" | null,
        ordererCustomerId: query.ordererCustomerId as string | undefined,
        deliveryTargetCustomerId: query.deliveryTargetCustomerId as
          | string
          | undefined,
        deliveryPlaceId: query.deliveryPlaceId as string | undefined,
        orderStatus: query.orderStatus as string | undefined,
        search: query.search as string | undefined,
        sort: query.sort as string | undefined,
        order: query.order as "asc" | "desc" | undefined,
        orderId: query.orderId as string | undefined,
        customerName: query.customerName as string | undefined,
        productName: query.productName as string | undefined,
        receiptNumber: query.receiptNumber as string | undefined,
        phoneNumber: query.phoneNumber as string | undefined,
        code: query.code as string | undefined,
      };

      // Filter berdasarkan sales channel
      if (queryParams.salesChannelId) {
        filter.salesChannelId = queryParams.salesChannelId;
      }

      // Filter berdasarkan tanggal order
      if (queryParams.orderDate) {
        const date = new Date(queryParams.orderDate);
        filter.orderDate = {
          gte: new Date(date.setHours(0, 0, 0, 0)),
          lte: new Date(date.setHours(23, 59, 59, 999)),
        };
      }

      // Filter berdasarkan bulan dan tahun
      if (queryParams.orderMonth) {
        const month = Number.parseInt(queryParams.orderMonth);
        filter.orderDate = {
          gte: new Date(new Date().getFullYear(), month - 1, 1),
          lte: new Date(new Date().getFullYear(), month, 0, 23, 59, 59, 999),
        };
      }

      if (queryParams.orderYear) {
        // Filter hanya berdasarkan tahun
        const year = Number.parseInt(queryParams.orderYear);
        filter.orderDate = {
          gte: new Date(year, 0, 1),
          lte: new Date(year, 11, 31, 23, 59, 59, 999),
        };
      }

      // Filter berdasarkan range tanggal
      if (queryParams.startDate && queryParams.endDate) {
        filter.orderDate = {
          gte: new Date(new Date(queryParams.startDate).setHours(0, 0, 0, 0)),
          lte: new Date(
            new Date(queryParams.endDate).setHours(23, 59, 59, 999)
          ),
        };
      }

      // Filter berdasarkan kategori customer
      if (queryParams.customerCategory) {
        filter.OR = [
          {
            OrdererCustomer: {
              is: {
                category: {
                  equals: queryParams.customerCategory as CustomerCategories,
                },
              },
            },
          },
          {
            DeliveryTargetCustomer: {
              is: {
                category: {
                  equals: queryParams.customerCategory as CustomerCategories,
                },
              },
            },
          },
        ];
      }

      // Filter berdasarkan orderer customer
      if (queryParams.ordererCustomerId) {
        filter.ordererCustomerId = queryParams.ordererCustomerId;
      }

      // Filter berdasarkan delivery target customer
      if (queryParams.deliveryTargetCustomerId) {
        filter.deliveryTargetCustomerId = queryParams.deliveryTargetCustomerId;
      }

      // Filter berdasarkan delivery place
      if (queryParams.deliveryPlaceId) {
        filter.deliveryPlaceId = queryParams.deliveryPlaceId;
      }

      if (queryParams.orderStatus) {
        const validPaymentStatuses = [
          "settlement",
          "pending",
          "cancel",
          "installments",
        ];
        const paymentStatus = validPaymentStatuses.includes(
          queryParams.orderStatus
        )
          ? (queryParams.orderStatus as PaymentStatus)
          : undefined;

        if (paymentStatus) {
          if (!filter.OrderDetail) {
            filter.OrderDetail = {};
          }
          filter.OrderDetail.paymentStatus = paymentStatus;
        }
      }

      if (queryParams.unavailableReceipt === "yes") {
        if (!filter.OrderDetail) {
          filter.OrderDetail = {};
        }
        filter.OrderDetail.receiptNumber = null;
      }

      // Filter berdasarkan ID order
      if (queryParams.orderId) {
        filter.id = queryParams.orderId;
      }

      // Filter by order code
      if (queryParams.code) {
        if (!filter.OrderDetail) {
          filter.OrderDetail = {};
        }

        filter.OrderDetail.code = {
          contains: queryParams.code,
          mode: "insensitive" as const,
        };
      }

      // Filter berdasarkan nama pelanggan
      if (queryParams.customerName) {
        const customerNameFilter = {
          name: {
            contains: queryParams.customerName,
            mode: "insensitive" as const,
          },
        };

        filter.OR = [
          ...(filter.OR || []),
          { OrdererCustomer: customerNameFilter },
          { DeliveryTargetCustomer: customerNameFilter },
        ];
      }

      // Filter berdasarkan nama produk
      if (queryParams.productName) {
        if (!filter.OrderDetail) {
          filter.OrderDetail = {};
        }

        filter.OrderDetail.OrderProducts = {
          some: {
            Product: {
              name: {
                contains: queryParams.productName,
                mode: "insensitive" as const,
              },
            },
          },
        };
      }

      // Filter berdasarkan nomor resi
      if (queryParams.receiptNumber) {
        if (!filter.OrderDetail) {
          filter.OrderDetail = {};
        }

        filter.OrderDetail.receiptNumber = {
          contains: queryParams.receiptNumber,
          mode: "insensitive" as const,
        };
      }

      // Filter berdasarkan nomor telepon
      if (queryParams.phoneNumber) {
        const phoneNumberFilter = {
          phoneNumber: {
            contains: queryParams.phoneNumber,
            mode: "insensitive" as const,
          },
        };

        if (!filter.OR) {
          filter.OR = [];
        } else if (!Array.isArray(filter.OR)) {
          filter.OR = [filter.OR];
        }

        filter.OR.push(
          { OrdererCustomer: phoneNumberFilter },
          { DeliveryTargetCustomer: phoneNumberFilter }
        );
      }

      // Buat query untuk mendapatkan semua data dalam satu kali query
      const orders = await prismaClient().order.findMany({
        where: filter,
        orderBy: {
          createdAt: "desc",
        },
        include: {
          SalesChannel: true,
          DeliveryPlace: true,
          OrdererCustomer: true,
          DeliveryTargetCustomer: true,
          Installment: true,
          OrderDetail: {
            include: {
              PaymentMethod: queryParams.paymentMethodId
                ? {
                    where: {
                      id: queryParams.paymentMethodId,
                    },
                  }
                : true,
              OrderProducts: {
                where: queryParams.productId
                  ? { productId: queryParams.productId }
                  : undefined,
                include: {
                  Product: {
                    include: {
                      productVariants: true,
                    },
                  },
                },
              },
            },
            where: queryParams.paymentStatus
              ? { paymentStatus: queryParams.paymentStatus }
              : undefined,
          },
          ShippingServices: true,
        },
      });

      // Transformasi data untuk mempertahankan struktur respons yang sama
      const result = orders.map((order) => ({
        ...order,
        Installment:
          order?.Installment &&
          Array.isArray(order.Installment) &&
          order.Installment.length > 0
            ? order.Installment
            : null,
        OrderDetail: order.OrderDetail
          ? {
              ...order.OrderDetail,
              OrderProducts: order.OrderDetail.OrderProducts,
            }
          : null,
      }));

      // Filter hasil jika ada filter untuk payment method atau product
      let filteredResult = result;

      if (queryParams.paymentMethodId || queryParams.paymentStatus) {
        filteredResult = result.filter(
          (order) =>
            order.OrderDetail && order.OrderDetail.PaymentMethod !== null
        );
      }

      if (queryParams.productId) {
        filteredResult = filteredResult.filter(
          (order) =>
            order.OrderDetail && order.OrderDetail.OrderProducts.length > 0
        );
      }

      return ServiceResponse.success(
        "Berhasil mengambil data order",
        filteredResult,
        StatusCodes.OK
      );
    } catch (error) {
      console.error(error);
      logger.error(error);
      return ServiceResponse.failure(
        "Gagal mengambil data order",
        null,
        StatusCodes.INTERNAL_SERVER_ERROR
      );
    }
	};

	public getOne = async (id: string) => {
		try {
			const result = await prismaClient().order.findUnique({
				where: { id },
				include: {
					Installment: true,
					SalesChannel: true,
					DeliveryPlace: true,
					OrdererCustomer: true,
					DeliveryTargetCustomer: true,
					OrderDetail: {
						include: {
							OrderProducts: {
								include: {
									Product: {
										include: {
											productVariants: {
												include: {
													productPrices: true,
												},
											},
										},
									},
								},
							},
							PaymentMethod: true,
						},
					},
					ShippingServices: true,
				},
			});

			if (!result) {
				return ServiceResponse.failure("Data order tidak ditemukan", null, StatusCodes.NOT_FOUND);
			}

			return ServiceResponse.success("Berhasil mengambil data order", result, StatusCodes.OK);
    } catch (error) {
      console.error(error)
			logger.error(error);
			return ServiceResponse.failure("Gagal mengambil data order", null, StatusCodes.INTERNAL_SERVER_ERROR);
		}
	};

	public create = async (data: CreateOrderType["body"]) => {
		const prisma = prismaClient();
		let totalPrice = 0;

		// All validation before transaction
		try {
			// Cek customer pemesan
			if (data.order.ordererCustomerId) {
				const ordererCustomer = await prisma.customer.findUnique({
					where: { id: data.order.ordererCustomerId },
				});
				if (!ordererCustomer) {
					return ServiceResponse.failure("Data customer pemesan tidak ditemukan", null, StatusCodes.NOT_FOUND);
				}
			}

			// Cek customer tujuan pengiriman
			if (data.order.deliveryTargetCustomerId) {
				const deliveryTargetCustomer = await prisma.customer.findUnique({
					where: { id: data.order.deliveryTargetCustomerId },
				});
				if (!deliveryTargetCustomer) {
					return ServiceResponse.failure(
						"Data customer tujuan pengiriman tidak ditemukan",
						null,
						StatusCodes.NOT_FOUND,
					);
				}
			}

			// Cek tempat pengiriman
			if (data.order.deliveryPlaceId) {
				const deliveryPlace = await prisma.deliveryPlace.findUnique({
					where: { id: data.order.deliveryPlaceId },
				});
				if (!deliveryPlace) {
					return ServiceResponse.failure("Data tempat pengiriman tidak ditemukan", null, StatusCodes.NOT_FOUND);
				}
			}

			// Cek saluran penjualan
			if (data.order.salesChannelId) {
				const salesChannel = await prisma.salesChannel.findUnique({
					where: { id: data.order.salesChannelId },
				});
				if (!salesChannel) {
					return ServiceResponse.failure("Data saluran penjualan tidak ditemukan", null, StatusCodes.NOT_FOUND);
				}
			}

			// Validasi data detail order
			if (data.orderDetail.detail) {
				// Validasi kode order jika ada
				if (data.orderDetail.detail.code) {
					const existingOrder = await prisma.orderDetail.findFirst({
						where: { code: data.orderDetail.detail.code },
					});

					if (existingOrder) {
						return ServiceResponse.failure("Kode order sudah digunakan", null, StatusCodes.BAD_REQUEST);
					}
				}

				// Validasi otherFees jika ada
				if (data.orderDetail.detail.otherFees) {
					const { packaging, insurance, discount, ongkir1kg, installments } = data.orderDetail.detail.otherFees as {
						packaging?: number;
						insurance?: number;
						installments?: {
							paymentMethodId: string;
							paymentDate: Date;
							amount: number;
						};

						discount?: {
							value: number;
							type: "percent" | "nominal";
						};
						ongkir1kg?: number;
					};

					if (packaging && typeof packaging !== "number") {
						return ServiceResponse.failure("Biaya packaging harus berupa angka", null, StatusCodes.BAD_REQUEST);
					}
					if (installments && typeof installments.amount !== "number") {
						return ServiceResponse.failure("Biaya cicilan harus berupa angka", null, StatusCodes.BAD_REQUEST);
					}
					if (insurance && typeof insurance !== "number") {
						return ServiceResponse.failure("Biaya asuransi harus berupa angka", null, StatusCodes.BAD_REQUEST);
					}
					// Validasi productDiscount jika ada
					if (data.orderDetail.detail.otherFees?.productDiscount) {
						const { productDiscount } = data.orderDetail.detail.otherFees as {
							productDiscount?: Array<{
								produkVariantId: string;
								discountAmount: number;
								discountType: "percent" | "nominal";
							}>;
						};

						if (!Array.isArray(productDiscount)) {
							return ServiceResponse.failure("Diskon produk harus berupa array", null, StatusCodes.BAD_REQUEST);
						}

						for (const discount of productDiscount) {
							if (!discount.produkVariantId || typeof discount.produkVariantId !== "string") {
								return ServiceResponse.failure("ID varian produk harus valid", null, StatusCodes.BAD_REQUEST);
							}

							if (typeof discount.discountAmount !== "number") {
								return ServiceResponse.failure("Jumlah diskon harus berupa angka", null, StatusCodes.BAD_REQUEST);
							}

							if (discount.discountType !== "percent" && discount.discountType !== "nominal") {
								return ServiceResponse.failure(
									"Tipe diskon produk harus 'percent' atau 'nominal'",
									null,
									StatusCodes.BAD_REQUEST,
								);
							}
						}
					}
					if (discount) {
						if (typeof discount !== "object" || discount === null) {
							return ServiceResponse.failure("Diskon harus berupa objek", null, StatusCodes.BAD_REQUEST);
						}
						if (typeof discount.value !== "number") {
							return ServiceResponse.failure("Nilai diskon harus berupa angka", null, StatusCodes.BAD_REQUEST);
						}
						if (discount.type !== "percent" && discount.type !== "nominal") {
							return ServiceResponse.failure(
								"Tipe diskon harus 'percent' atau 'nominal'",
								null,
								StatusCodes.BAD_REQUEST,
							);
						}
					}
					if (ongkir1kg && typeof ongkir1kg !== "number") {
						return ServiceResponse.failure("Ongkir 1kg harus berupa angka", null, StatusCodes.BAD_REQUEST);
					}
				}
			}

			if (data.orderDetail.paymentMethod?.id) {
				const paymentMethod = await prisma.paymentMethod.findUnique({
					where: { id: data.orderDetail.paymentMethod.id },
				});
				if (!paymentMethod) {
					return ServiceResponse.failure("Data metode pembayaran tidak ditemukan", null, StatusCodes.NOT_FOUND);
				}
			}

			const productIds = data.orderDetail.orderProducts
				.filter((orderProduct) => orderProduct.productId)
				.map((orderProduct) => orderProduct.productId);

			if (productIds.length > 0) {
				const products = await prisma.product.findMany({
					where: { id: { in: productIds.filter((id): id is string => id !== undefined) } },
					select: { id: true },
				});

				const foundProductIds = products.map((product) => product.id);
				const missingProductIds = productIds.filter((id) => id !== undefined && !foundProductIds.includes(id));

				if (missingProductIds.length > 0) {
					return ServiceResponse.failure(
						`Data produk dengan ID ${missingProductIds.join(", ")} tidak ditemukan`,
						null,
						StatusCodes.NOT_FOUND,
					);
				}
			}

			// Validasi shipping services jika ada
			if (data.orderDetail.shippingServices && data.orderDetail.shippingServices.length > 0) {
				for (const service of data.orderDetail.shippingServices) {
					if (!service.shippingName || !service.serviceName) {
						return ServiceResponse.failure("Data shipping service tidak lengkap", null, StatusCodes.BAD_REQUEST);
					}
				}
			}

			// Transactional block
			const result = await prisma.$transaction(async (tx) => {
				// Langkah 1: Buat order
				const createdOrder = await tx.order.create({
					data: {
						ordererCustomerId: data.order.ordererCustomerId,
						deliveryTargetCustomerId: data.order.deliveryTargetCustomerId,
						deliveryPlaceId: data.order.deliveryPlaceId,
						salesChannelId: data.order.salesChannelId,
						orderDate: data.order.orderDate ? new Date(data.order.orderDate) : undefined,
						note: data.order.note,
					},
				});

				// Langkah 2: Ambil data customer untuk menentukan kategori harga
				const customer = await tx.customer.findUnique({
					where: { id: data.order.ordererCustomerId },
					select: { category: true },
				});

				if (!customer) {
					throw new Error("Data customer tidak ditemukan");
				}

				const customerCategory = customer.category || "CUSTOMER";

				// Langkah 3: Hitung harga produk berdasarkan kategori customer
				const products = await tx.product.findMany({
					where: { id: { in: productIds.filter((id): id is string => id !== undefined) } },
					include: {
						productVariants: {
							include: {
								productPrices: true,
							},
						},
					},
				});

				const productMap = new Map();
				for (const product of products) {
					productMap.set(product.id, product);
				}

				// 1. Hitung total harga produk & siapkan data orderProduct
				const orderProductDataList: {
					productId: string;
					productVariantId?: string;
					productQty: number;
					productPrice: number;
				}[] = [];

				for (const orderProduct of data.orderDetail.orderProducts) {
					if (!orderProduct.productId) continue;

					const product = productMap.get(orderProduct.productId);
					if (!product) continue;

					let productPrice = 0;
					let variant = null;

					// Cari varian yang sesuai dengan productVariantId jika ada
					if (orderProduct.productVariantId) {
						// biome-ignore lint/suspicious/noExplicitAny: <explanation>
						variant = product.productVariants.find((v: any) => v.id === orderProduct.productVariantId);
					} else {
						variant = product.productVariants[0];
					}

					if (variant?.productPrices && variant.productPrices.length > 0) {
						const priceData = variant.productPrices[0]; // Ambil data harga pertama dari array

						// Tentukan harga berdasarkan kategori customer
						switch (customerCategory) {
							case "CUSTOMER":
							case "DROPSHIPPER":
								productPrice = Number(priceData.normal) || 0;
								break;
							case "MEMBER":
								productPrice = Number(priceData.member) || Number(priceData.normal) || 0;
								break;
							case "RESELLER":
								productPrice = Number(priceData.reseller) || Number(priceData.normal) || 0;
								break;
							case "AGENT":
								productPrice = Number(priceData.agent) || Number(priceData.normal) || 0;
								break;
							default:
								productPrice = Number(priceData.normal) || 0;
						}
					}

					// Tambahkan ke total price (harga * quantity)
					totalPrice += Number(productPrice) * Number(orderProduct.productQty);

					orderProductDataList.push({
						productId: orderProduct.productId,
						productVariantId: orderProduct.productVariantId,
						productQty: orderProduct.productQty,
						productPrice,
					});
				}

				// 2. Tambahkan other fees jika ada (tidak berubah)
				if (data.orderDetail.detail.otherFees) {
					const otherFees = data.orderDetail.detail.otherFees;

					// Tambahkan biaya asuransi
					if (otherFees.insurance) {
						totalPrice += Number(otherFees.insurance);
					}

					// biome-ignore lint/complexity/useOptionalChain: <explanation>
					if (otherFees.installments && otherFees.installments.paymentMethodId && otherFees.installments.amount) {
						await tx.installment.create({
							data: {
								orderId: createdOrder.id,
								paymentMethodId: otherFees.installments.paymentMethodId,
								paymentDate: otherFees.installments.paymentDate
									? new Date(otherFees.installments.paymentDate)
									: new Date(),
								amount: Number(otherFees.installments.amount),
								isPaid: true,
							},
						});

						totalPrice += Number(otherFees.installments.amount);
					}

					if (otherFees.productDiscount && otherFees.productDiscount.length > 0) {
						for (const discount of otherFees.productDiscount) {
							const product = data.orderDetail.orderProducts.find(
								(p) => p.productVariantId === discount.produkVariantId,
							);
							if (!product) continue;

							const productPriceDB = await tx.productPrice.findFirst({
								where: { productVariantId: product.productVariantId },
							});

							if (!productPriceDB) continue;
							let discountProductPrice = 0;
							switch (customerCategory) {
								case "CUSTOMER":
								case "DROPSHIPPER":
									discountProductPrice = Number(productPriceDB.normal) || 0;
									break;
								case "MEMBER":
									discountProductPrice = Number(productPriceDB.member) || Number(productPriceDB.normal) || 0;
									break;
								case "RESELLER":
									discountProductPrice = Number(productPriceDB.reseller) || Number(productPriceDB.normal) || 0;
									break;
								case "AGENT":
									discountProductPrice = Number(productPriceDB.agent) || Number(productPriceDB.normal) || 0;
									break;
								default:
									discountProductPrice = Number(productPriceDB.normal) || 0;
							}

							// Hitung diskon
							const productQty = Number(product.productQty);
							let discountAmount = 0;

							if (discount.discountType === "percent") {
								discountAmount = (discountProductPrice * productQty * Number(discount.discountAmount)) / 100;
							} else {
								discountAmount = Number(discount.discountAmount) * productQty;
							}

							totalPrice -= discountAmount;
						}
					}

					// Tambahkan biaya packaging
					if (otherFees.packaging) {
						totalPrice += Number(otherFees.packaging);
					}

					// Tambahkan biaya berdasarkan berat
					if (otherFees.weight) {
						const orderWeight = 1; // Berat order dalam kg
						totalPrice += orderWeight * Number(otherFees.weight);
					}

					// Tambahkan biaya pengiriman
					if (otherFees.shippingCost?.cost) {
						totalPrice += Number(otherFees.shippingCost.cost);
					}

					// Proses diskon keseluruhan
					if (otherFees.discount?.value) {
						if (otherFees.discount.type === "percent") {
							totalPrice -= (totalPrice * Number(otherFees.discount.value)) / 100;
						} else {
							totalPrice -= Number(otherFees.discount.value);
						}
					}
				}

				// 3. Buat order detail
				const createdOrderDetail = await tx.orderDetail.create({
					data: {
						orderId: createdOrder.id,
						paymentMethodId: data.orderDetail.paymentMethod?.id,
						code:
							data.orderDetail.detail.code ||
							`OID-${Date.now().toString().slice(-4)}-${Math.floor(1000 + Math.random() * 9000)}`,
						otherFees: data.orderDetail.detail.otherFees,
						originalFinalPrice: Number(totalPrice),
						finalPrice: data.orderDetail.detail.originalFinalPrice
							? Number(data.orderDetail.detail.originalFinalPrice)
							: Number(totalPrice),
						paymentStatus: data.orderDetail.paymentMethod?.status
							? (data.orderDetail.paymentMethod?.status.toUpperCase() as PaymentStatus)
							: undefined,
						paymentDate: data.orderDetail.paymentMethod?.date
							? new Date(data.orderDetail.paymentMethod?.date)
							: undefined,
						receiptNumber: data.orderDetail.detail.receiptNumber,
					},
				});

				// 4. Buat order products & update stok
				for (const orderProduct of orderProductDataList) {
					// Validasi productId
					if (!orderProduct.productId) {
						throw new Error("productId is required");
					}

					// Cek keberadaan dan stok varian produk
					let productVariant = null;
					if (orderProduct.productVariantId) {
						productVariant = await tx.productVariant.findUnique({
							where: { id: orderProduct.productVariantId },
						});
					}

					// Validasi keberadaan varian produk jika ada
					if (orderProduct.productVariantId && !productVariant) {
						throw new Error("product variant is not found");
					}

					// Validasi ketersediaan stok jika ada varian
					if (productVariant && productVariant.stock !== null && productVariant.stock < orderProduct.productQty) {
						throw new Error(`Stok produk dengan ID ${orderProduct.productVariantId} tidak mencukupi`);
					}

					// Kurangi stok produk jika ada varian
					if (orderProduct.productVariantId && productVariant) {
						await tx.productVariant.update({
							where: { id: orderProduct.productVariantId },
							data: { stock: { decrement: orderProduct.productQty } },
						});
					}

					// Buat entri order product
					await tx.orderProduct.create({
						data: {
							orderId: createdOrder.id,
							orderDetailId: createdOrderDetail.id,
							productId: orderProduct.productId,
							productQty: orderProduct.productQty,
							productVariantId: orderProduct.productVariantId,
						},
					});
				}

				// 5. Buat shipping services jika ada
				if (data.orderDetail.shippingServices && data.orderDetail.shippingServices.length > 0) {
					const shippingServicesPromises = data.orderDetail.shippingServices.map((shippingService) =>
						tx.shippingService.create({
							data: {
								orderId: createdOrder.id,
								shippingName: shippingService.shippingName,
								serviceName: shippingService.serviceName,
								weight: shippingService.weight,
								isCod: shippingService.isCod,
								shippingCost: shippingService.shippingCost,
								shippingCashback: shippingService.shippingCashback,
								shippingCostNet: shippingService.shippingCostNet,
								grandtotal: shippingService.grandtotal,
								serviceFee: shippingService.serviceFee,
								netIncome: shippingService.netIncome,
								etd: shippingService.etd,
								type: shippingService.type,
							},
						}),
					);

					await Promise.all(shippingServicesPromises);
				}

				return {
					...createdOrder,
					orderDetail: createdOrderDetail,
				};
			});

			return ServiceResponse.success("Berhasil membuat data order", result, StatusCodes.CREATED);
    } catch (error) {
      console.error(error)
			logger.error(error);
			return ServiceResponse.failure(
				"Gagal membuat data order",
				(error as Error).message,
				StatusCodes.INTERNAL_SERVER_ERROR,
			);
		}
	};

	public update = async (id: string, data: Partial<UpdateOrderType>["body"]) => {
		try {
			let totalPrice = 0;

			const existingOrder = await prismaClient().order.findUnique({
				where: { id },
				include: {
					SalesChannel: true,
					DeliveryPlace: true,
					OrdererCustomer: true,
					DeliveryTargetCustomer: true,
					OrderDetail: {
						include: {
							OrderProducts: {
								include: {
									Product: true,
								},
							},
							PaymentMethod: true,
						},
					},
					ShippingServices: true,
				},
			});

			if (!existingOrder) {
				return ServiceResponse.failure("Data order tidak ditemukan", null, StatusCodes.NOT_FOUND);
			}

			// Cek customer pemesan jika ada perubahan
			if (data?.order?.ordererCustomerId) {
				const ordererCustomer = await prismaClient().customer.findUnique({
					where: { id: data.order.ordererCustomerId },
				});
				if (!ordererCustomer) {
					return ServiceResponse.failure("Data customer pemesan tidak ditemukan", null, StatusCodes.NOT_FOUND);
				}
			}

			// Cek customer tujuan pengiriman jika ada perubahan
			if (data?.order?.deliveryTargetCustomerId) {
				const deliveryTargetCustomer = await prismaClient().customer.findUnique({
					where: { id: data.order.deliveryTargetCustomerId },
				});
				if (!deliveryTargetCustomer) {
					return ServiceResponse.failure(
						"Data customer tujuan pengiriman tidak ditemukan",
						null,
						StatusCodes.NOT_FOUND,
					);
				}
			}

			// Cek tempat pengiriman jika ada perubahan
			if (data?.order?.deliveryPlaceId) {
				const deliveryPlace = await prismaClient().deliveryPlace.findUnique({
					where: { id: data.order.deliveryPlaceId },
				});
				if (!deliveryPlace) {
					return ServiceResponse.failure("Data tempat pengiriman tidak ditemukan", null, StatusCodes.NOT_FOUND);
				}
			}

			// Cek saluran penjualan jika ada perubahan
			if (data?.order?.salesChannelId) {
				const salesChannel = await prismaClient().salesChannel.findUnique({
					where: { id: data.order.salesChannelId },
				});
				if (!salesChannel) {
					return ServiceResponse.failure("Data saluran penjualan tidak ditemukan", null, StatusCodes.NOT_FOUND);
				}
			}

			// Cek metode pembayaran untuk detail order jika ada perubahan
			if (data?.orderDetail?.paymentMethod?.id) {
				const paymentMethod = await prismaClient().paymentMethod.findUnique({
					where: { id: data.orderDetail.paymentMethod.id },
				});
				if (!paymentMethod) {
					return ServiceResponse.failure("Data metode pembayaran tidak ditemukan", null, StatusCodes.NOT_FOUND);
				}
			}

			if (data?.orderDetail?.orderProducts && data.orderDetail.orderProducts.length > 0) {
				// Ambil data customer untuk menentukan kategori harga
				const customer = await prismaClient().customer.findUnique({
					where: { id: data.order?.ordererCustomerId },
					select: { category: true },
				});

				const customerCategory = customer?.category;

				const productIds = data.orderDetail.orderProducts
					.map((product) => product.productId)
					.filter((id): id is string => id !== undefined);

				const products = await prismaClient().product.findMany({
					where: {
						id: {
							in: productIds,
						},
					},
					include: {
						productVariants: {
							include: {
								productPrices: true,
							},
						},
					},
				});

				// Hitung total harga berdasarkan produk dan kuantitas
				for (const orderProduct of data.orderDetail.orderProducts) {
					if (!orderProduct.productId) continue;

					const product = products.find((p) => p.id === orderProduct.productId);
					if (!product || !product.productVariants || product.productVariants.length === 0) continue;

					// Cari variant yang sesuai dengan productVariantId jika ada
					let variant = product.productVariants[0];
					if (orderProduct.productVariantId) {
						const matchingVariant = product.productVariants.find((v) => v.id === orderProduct.productVariantId);
						if (matchingVariant) {
							variant = matchingVariant;
						}
					}

					if (variant?.productPrices && variant.productPrices.length > 0) {
						const priceData = variant.productPrices[0];

						// Tentukan harga berdasarkan kategori customer
						let productPrice = 0;

						switch (customerCategory) {
							case "CUSTOMER":
							case "DROPSHIPPER":
								productPrice = Number(priceData.normal) || 0;
								break;
							case "MEMBER":
								productPrice = Number(priceData.member) || Number(priceData.normal) || 0;
								break;
							case "RESELLER":
								productPrice = Number(priceData.reseller) || Number(priceData.normal) || 0;
								break;
							case "AGENT":
								productPrice = Number(priceData.agent) || Number(priceData.normal) || 0;
								break;
							default:
								productPrice = Number(priceData.normal) || 0;
						}

						// Dapatkan quantity produk saat ini
						const productQty = Number(orderProduct.productQty) || 1;

						// Cari produk yang sama di order yang sudah ada jika ada
						let existingProductQty = 0;
						if (existingOrder?.OrderDetail?.OrderProducts) {
							const existingProduct = existingOrder.OrderDetail.OrderProducts.find(
								(p) => p.productId === orderProduct.productId && !orderProduct.productVariantId,
							);
							if (existingProduct) {
								existingProductQty = Number(existingProduct.productQty) || 0;
							}
						}

						// Gunakan quantity dari order product saat ini, atau dari existing order jika tidak ada
						const finalQty = Number(productQty) || Number(existingProductQty) || 1;

						// Tambahkan ke total price (harga * quantity)
						totalPrice += Number(productPrice) * Number(finalQty);
					}
				}

				// Tambahkan biaya lain jika ada
				if (data.orderDetail.detail?.otherFees) {
					const otherFees = data.orderDetail.detail.otherFees as {
						packaging?: number;
						insurance?: number;
						discount?: {
							value: number;
							type: "percent" | "nominal";
						};
						productDiscount?: Array<{
							produkVariantId: string;
							discountAmount: number;
							discountType: "percent" | "nominal";
						}>;
						installments?: {
							paymentMethodId: string;
							paymentDate?: Date;
							amount: number;
						};
						ongkir1kg?: number;
						weight?: number;
						shippingCost?: {
							shippingService: string;
							type: string;
							cost: number;
						};
					};

					// Proses biaya tambahan
					if (otherFees.packaging) {
						totalPrice += Number(otherFees.packaging) || 0;
					}

					if (otherFees.installments) {
						if (otherFees.installments.paymentMethodId && otherFees.installments.amount) {
							// Cek apakah installment sudah ada untuk order ini
							const existingInstallment = await prismaClient().installment.findFirst({
								where: {
									orderId: id,
									paymentMethodId: otherFees.installments.paymentMethodId,
								},
							});

							if (existingInstallment) {
								// Update installment yang sudah ada
								await prismaClient().installment.update({
									where: { id: existingInstallment.id },
									data: {
										paymentMethodId: otherFees.installments.paymentMethodId,
										paymentDate: otherFees.installments.paymentDate
											? new Date(otherFees.installments.paymentDate)
											: new Date(),
										amount: Number(otherFees.installments.amount),
										isPaid: true,
									},
								});
							} else {
								// Buat installment baru
								await prismaClient().installment.create({
									data: {
										orderId: id,
										paymentMethodId: otherFees.installments.paymentMethodId,
										paymentDate: otherFees.installments.paymentDate
											? new Date(otherFees.installments.paymentDate)
											: new Date(),
										amount: Number(otherFees.installments.amount),
										isPaid: true,
									},
								});
							}
						}
					}

					if (otherFees.insurance) {
						totalPrice += Number(otherFees.insurance) || 0;
					}

					if (otherFees.weight) {
						const orderWeight = 1; // Order weight in kg
						const pricePerKg = Number(otherFees.weight) || 0;
						totalPrice += orderWeight * pricePerKg;
					}

					if (otherFees.shippingCost?.cost) {
						totalPrice += Number(otherFees.shippingCost.cost) || 0;
					}

					if (otherFees.discount) {
						if (otherFees.discount.type === "percent" && otherFees.discount.value) {
							const discountAmount = (totalPrice * Number(otherFees.discount.value)) / 100;
							totalPrice -= discountAmount;
						} else if (otherFees.discount.type === "nominal" && otherFees.discount.value) {
							totalPrice -= Number(otherFees.discount.value);
						}
					}

					// Proses diskon produk
					if (otherFees.productDiscount && otherFees.productDiscount.length > 0) {
						for (const discount of otherFees.productDiscount) {
							const product = data.orderDetail.orderProducts.find(
								(p) => p.productVariantId === discount.produkVariantId,
							);

							if (product) {
								const productPriceDB = await prismaClient().productPrice.findFirst({
									where: { productVariantId: product.productVariantId },
								});

								let discountProductPrice = 0;

								if (productPriceDB) {
									switch (customerCategory) {
										case "CUSTOMER":
										case "DROPSHIPPER":
											discountProductPrice = Number(productPriceDB.normal) || 0;
											break;
										case "RESELLER":
											discountProductPrice = Number(productPriceDB.reseller) || Number(productPriceDB.normal) || 0;
											break;
										case "MEMBER":
											discountProductPrice = Number(productPriceDB.member) || Number(productPriceDB.normal) || 0;
											break;
										case "AGENT":
											discountProductPrice = Number(productPriceDB.agent) || Number(productPriceDB.normal) || 0;
											break;
										default:
											discountProductPrice = Number(productPriceDB.normal) || 0;
									}
								}

								// Hitung jumlah diskon berdasarkan tipe
								let discountAmount = 0;
								if (discount.discountType === "percent") {
									discountAmount =
										(Number(discountProductPrice) *
											(Number(product.productQty) || 0) *
											Number(discount.discountAmount)) /
										100;
								} else if (discount.discountType === "nominal") {
									discountAmount = Number(discount.discountAmount) * (Number(product.productQty) || 0);
								}

								// Kurangi total harga dengan diskon
								totalPrice -= Number(discountAmount);
							}
						}
					}
				}
			}

			// Memisahkan transaksi menjadi beberapa bagian untuk mengurangi waktu eksekusi

			// 1. Update order dasar
			await prismaClient().order.update({
				where: { id },
				data: {
					ordererCustomerId: data?.order?.ordererCustomerId,
					deliveryTargetCustomerId: data?.order?.deliveryTargetCustomerId,
					deliveryPlaceId: data?.order?.deliveryPlaceId,
					salesChannelId: data?.order?.salesChannelId,
					orderDate: data?.order?.orderDate ? new Date(data.order.orderDate) : undefined,
					note: data?.order?.note,
				},
			});

			// 2. Update order detail jika ada
			if (data?.orderDetail) {
				const orderDetailData = {
					paymentMethodId: data.orderDetail.paymentMethod?.id,
					code: data.orderDetail.detail?.code,
					otherFees: data.orderDetail.detail?.otherFees ? data.orderDetail.detail.otherFees : undefined,
					originalFinalPrice: Number(totalPrice),
					finalPrice: data.orderDetail.detail?.originalFinalPrice
						? Number(data.orderDetail.detail.originalFinalPrice)
						: Number(totalPrice),
					paymentStatus: data.orderDetail.paymentMethod?.status
						? (data.orderDetail.paymentMethod.status.toUpperCase() as PaymentStatus)
						: undefined,
					paymentDate: data.orderDetail.paymentMethod?.date ? new Date(data.orderDetail.paymentMethod.date) : undefined,
					receiptNumber: data.orderDetail.detail?.receiptNumber,
				};

				if (existingOrder.OrderDetail) {
					// Update order detail yang sudah ada
					await prismaClient().orderDetail.update({
						where: { id: existingOrder.OrderDetail.id },
						data: orderDetailData,
					});
				} else {
					// Buat order detail baru jika belum ada
					await prismaClient().orderDetail.create({
						data: {
							orderId: id,
							...orderDetailData,
						},
					});
				}
			}

			// 3. Update order products jika ada
			if (data?.orderDetail?.orderProducts && data.orderDetail.orderProducts.length > 0) {
				// Hapus order products lama
				await prismaClient().orderProduct.deleteMany({
					where: { orderId: id },
				});

				// Buat order products baru
				const orderProductPromises = data.orderDetail.orderProducts.map(async (orderProduct) => {
					// Validasi data produk
					if (!orderProduct.productId) {
						throw new Error("productId tidak ditemukan");
					}

					if (!orderProduct.productQty) {
						throw new Error("productQty tidak ditemukan");
					}

					// Cek keberadaan dan stok varian produk jika ada
					if (orderProduct.productVariantId) {
						const productVariant = await prismaClient().productVariant.findUnique({
							where: { id: orderProduct.productVariantId },
						});

						if (!productVariant) {
							throw new Error(`Varian produk dengan ID ${orderProduct.productVariantId} tidak ditemukan`);
						}

						// Cari produk yang sama di order lama
						const existingProduct = existingOrder.OrderDetail?.OrderProducts?.find(
							(p) => p.productVariantId === orderProduct.productVariantId,
						);

						// Hitung selisih qty antara order saat ini dengan yang sebelumnya
						const previousQty = existingProduct ? existingProduct.productQty : 0;
						const qtyDifference = orderProduct.productQty - previousQty;

						// Validasi stok produk berdasarkan selisih qty
						if (productVariant.stock !== null && qtyDifference > 0 && productVariant.stock < qtyDifference) {
							// Dapatkan informasi produk untuk pesan error yang lebih informatif
							const product = await prismaClient().product.findUnique({
								where: { id: orderProduct.productId },
								select: { name: true },
							});

							throw new Error(
								`Stok produk ${product?.name || ""} dengan SKU ${productVariant.sku || "tidak diketahui"} tidak mencukupi. Stok tersedia: ${productVariant.stock}, dibutuhkan tambahan: ${qtyDifference}`,
							);
						}

						// Update stok berdasarkan selisih qty
						if (qtyDifference !== 0) {
							console.log("UPDATE STOCK");
							console.log({ qtyDifference });
							if (qtyDifference > 0) {
								console.log(`Mengurangi stok untuk variant ${orderProduct.productVariantId} sebanyak ${qtyDifference}`);
								// Dapatkan stok saat ini dari database
								const currentVariant = await prismaClient().productVariant.findUnique({
									where: { id: orderProduct.productVariantId },
									select: { stock: true },
								});
								console.log({ currentVariant });

								// Hitung stok baru dengan mengurangi langsung
								const newStock = (currentVariant?.stock || 0) - qtyDifference;
								console.log({ newStock });

								// Update stok dengan nilai absolut
								await prismaClient().productVariant.update({
									where: { id: orderProduct.productVariantId },
									data: { stock: newStock },
								});
							} else {
								console.log(
									`Menambah stok untuk variant ${orderProduct.productVariantId} sebanyak ${Math.abs(qtyDifference)}`,
								);
								// Dapatkan stok saat ini dari database
								const currentVariant = await prismaClient().productVariant.findUnique({
									where: { id: orderProduct.productVariantId },
									select: { stock: true },
								});

								console.log({ currentVariant });

								// Hitung stok baru dengan menambahkan langsung
								const newStock = (currentVariant?.stock || 0) + Math.abs(qtyDifference);
								console.log({ newStock });
								// Update stok dengan nilai absolut
								await prismaClient().productVariant.update({
									where: { id: orderProduct.productVariantId },
									data: { stock: newStock },
								});
							}
						}
					}

					// Buat order product baru
					return prismaClient().orderProduct.create({
						data: {
							orderId: id,
							productId: orderProduct.productId,
							productQty: orderProduct.productQty,
							orderDetailId: existingOrder.OrderDetail?.id,
							productVariantId: orderProduct.productVariantId,
						},
					});
				});

				await Promise.all(orderProductPromises);
			}

			// 4. Update shipping services jika ada
			if (data?.orderDetail?.shippingServices && data.orderDetail.shippingServices.length > 0) {
				// Hapus shipping services lama
				await prismaClient().shippingService.deleteMany({
					where: { orderId: id },
				});

				// Buat shipping services baru
				await Promise.all(
					data.orderDetail.shippingServices.map((shippingService) =>
						prismaClient().shippingService.create({
							data: {
								orderId: id,
								shippingName: shippingService.shippingName,
								serviceName: shippingService.serviceName,
								weight: shippingService.weight,
								isCod: shippingService.isCod,
								shippingCost: shippingService.shippingCost,
								shippingCashback: shippingService.shippingCashback,
								shippingCostNet: shippingService.shippingCostNet,
								grandtotal: shippingService.grandtotal,
								serviceFee: shippingService.serviceFee,
								netIncome: shippingService.netIncome,
								etd: shippingService.etd,
								type: shippingService.type,
							},
						}),
					),
				);
			}

			// 5. Ambil data order yang sudah diupdate beserta detailnya
			const result = await prismaClient().order.findUnique({
				where: { id },
				include: {
					SalesChannel: true,
					DeliveryPlace: true,
					OrdererCustomer: true,
					DeliveryTargetCustomer: true,
					OrderDetail: {
						include: {
							OrderProducts: {
								include: {
									Product: true,
								},
							},
							PaymentMethod: true,
						},
					},
					ShippingServices: true,
				},
			});

			return ServiceResponse.success("Berhasil mengupdate data order", result, StatusCodes.OK);
    } catch (error) {
      console.error(error)
			logger.error(error);
			return ServiceResponse.failure(
				"Gagal mengupdate data order",
				(error as Error).message,
				StatusCodes.INTERNAL_SERVER_ERROR,
			);
		}
	};

	public delete = async (id: string) => {
		try {
			const existingOrder = await prismaClient().order.findUnique({
				where: { id },
				include: {
					OrderDetail: {
						include: {
							OrderProducts: true,
						},
					},
					ShippingServices: true,
				},
			});

			if (!existingOrder) {
				return ServiceResponse.failure("Data order tidak ditemukan", null, StatusCodes.NOT_FOUND);
			}

			// Hapus data terkait terlebih dahulu menggunakan transaksi
			const result = await prismaClient().$transaction(async (prisma) => {
				// Hapus shipping services jika ada
				if (existingOrder.ShippingServices.length > 0) {
					await prisma.shippingService.deleteMany({
						where: { orderId: id },
					});
				}

				// Hapus order products jika ada
				if (existingOrder.OrderDetail?.OrderProducts && existingOrder.OrderDetail.OrderProducts.length > 0) {
					await prisma.orderProduct.deleteMany({
						where: { orderDetailId: existingOrder.OrderDetail.id },
					});
				}

				// Hapus order detail jika ada
				if (existingOrder.OrderDetail) {
					await prisma.orderDetail.delete({
						where: { id: existingOrder.OrderDetail.id },
					});
				}

				// Hapus order
				return await prisma.order.delete({
					where: { id },
				});
			});

			return ServiceResponse.success("Berhasil menghapus data order", result, StatusCodes.OK);
    } catch (error) {
      console.error(error)
			logger.error(error);
			return ServiceResponse.failure(
				"Gagal menghapus data order",
				(error as Error).message,
				StatusCodes.INTERNAL_SERVER_ERROR,
			);
		}
	};

	public exportOrders = async (params: GetAllOrdersParams) => {
		try {
			const formatter = new Intl.DateTimeFormat("id-ID", {
				timeZone: "Asia/Jakarta",
				dateStyle: "short",
			});

			return exportData<OrderWithRelations>(
				params,
				async (where): Promise<OrderWithRelations[]> => {
					const queryParams = {
						productId: undefined as string | undefined,
						paymentMethodId: undefined as string | undefined,
						paymentStatus: undefined as PaymentStatus | undefined,
					};

					// Ambil data order dengan relasi yang dibutuhkan
					const orders = await prismaClient().order.findMany({
						where: where as Prisma.OrderWhereInput,
						include: {
							SalesChannel: true,
							DeliveryPlace: true,
							OrdererCustomer: true,
							DeliveryTargetCustomer: true,
							OrderDetail: {
								include: {
									OrderProducts: {
										where: queryParams.productId ? { productId: queryParams.productId } : undefined,
										include: {
											Product: {
												include: {
													productVariants: true,
												},
											},
										},
									},
									PaymentMethod:
										queryParams.paymentMethodId || queryParams.paymentStatus
											? {
													where: {
														...(queryParams.paymentMethodId && { id: queryParams.paymentMethodId }),
														...(queryParams.paymentStatus && { status: queryParams.paymentStatus }),
													},
												}
											: true,
								},
							},
							ShippingServices: true,
						},
						orderBy: { createdAt: "desc" },
					});

					return orders as unknown as OrderWithRelations[];
				},
				(order: OrderWithRelations, index: number) => {
					const totalItems =
						order.OrderDetail?.OrderProducts?.reduce(
							// biome-ignore lint/suspicious/noExplicitAny: <explanation>
							(sum: number, op: any) => sum + (op.productQty || 0),
							0,
						) ?? 0;
					const productList =
						// biome-ignore lint/suspicious/noExplicitAny: <explanation>
						order.OrderDetail?.OrderProducts?.map((op: any) => {
							const variants = op.Product?.productVariants || [];
							const variantInfo =
								variants.length > 0
									? `(SKU: ${variants
											// biome-ignore lint/suspicious/noExplicitAny: <explanation>
											.map((v: any) => v?.sku || "N/A")
											.join(", ")})`
									: "";

							// Format nama produk dengan SKU dan jumlah yang lebih mudah dibaca
							return `${op.Product?.name || "Produk"} ${variantInfo} x${op.productQty || 0}`;
						}).join(", ") ?? "";

					const shippingCost = order.OrderDetail?.otherFees?.shippingCost?.cost ?? 0;
					const otherFees =
						(order.OrderDetail?.otherFees?.insurance ?? 0) +
						(order.OrderDetail?.otherFees?.packaging ?? 0) +
						(order.OrderDetail?.otherFees?.weight ?? 0);
					const totalPrice = order.OrderDetail?.finalPrice ?? 0;
					let totalProductPrice = 0;

					if (order.OrderDetail) {
						const totalHarga = order.OrderDetail.finalPrice || 0;

						let diskonValue = 0;
						if (order.OrderDetail.otherFees?.discount) {
							if (order.OrderDetail.otherFees.discount.type === "percent") {
								diskonValue = (totalHarga * order.OrderDetail.otherFees.discount.value) / 100;
							} else {
								diskonValue = order.OrderDetail.otherFees.discount.value || 0;
							}
						}

						const totalBiayaLain = shippingCost + otherFees;

						totalProductPrice = totalHarga - diskonValue - totalBiayaLain;

						totalProductPrice = Math.max(0, totalProductPrice);
					}
					const diskon = order.OrderDetail?.otherFees?.discount
						? order.OrderDetail.otherFees.discount.type === "percent"
							? `${order.OrderDetail.otherFees.discount.value}%`
							: order.OrderDetail.otherFees.discount.value
						: 0;

					// Mengembalikan satu baris data untuk satu order
					return {
						No: index + 1,
						"Kode Order": order.OrderDetail?.code ?? "",
						Pemesan: order.OrdererCustomer?.name ?? "",
						"Pelanggan Tujuan": order.DeliveryTargetCustomer?.name ?? "",
						"Lokasi Pengiriman": order.DeliveryPlace?.name ?? "",
						"Channel Penjualan": order.SalesChannel?.name ?? "",
						"Metode Pembayaran": order.OrderDetail?.PaymentMethod?.name ?? "",
						"Status Pembayaran": order.OrderDetail?.paymentStatus ?? "",
						"Tanggal Order": order.orderDate ? formatter.format(new Date(order.orderDate)) : "",
						"Tanggal Pembayaran": order.OrderDetail?.paymentDate
							? formatter.format(new Date(order.OrderDetail.paymentDate))
							: "",
						"Produk & Qty": productList,
						"Total Item": totalItems,
						"Total Harga Produk": totalProductPrice,
						Ongkir: shippingCost,
						"Biaya Lainnya": otherFees,
						Discount: diskon,
						"Total Keseluruhan": totalPrice,
						"Nomor Resi": order.OrderDetail?.receiptNumber ?? "",
						"Layanan Pengiriman": order.ShippingServices?.[0]?.serviceName ?? "",
						"Tipe Pengiriman": order.OrderDetail?.otherFees?.shippingCost?.type ?? "",
						Catatan: order.note ?? "",
						"Tanggal Dibuat": order.createdAt ? formatter.format(new Date(order.createdAt)) : "",
					};
				},
				"Orders",
				"Tidak ada data pesanan untuk diekspor",
			);
		} catch (error) {
			logger.error(error);
			return ServiceResponse.failure("Gagal mengekspor data pesanan", null, StatusCodes.INTERNAL_SERVER_ERROR);
		}
	};

	public importOrders = async (file: Buffer) => {
		try {
			const importResult = await importData<Prisma.OrderWhereInput>(
				file,
				<T>(row: Record<string, unknown>, index: number): T => {
					const orderCode = row["Kode Order"] as string;

					const orderDate = row["Tanggal Order"] || null;
					const note = row.Catatan as string;

					// Data pelanggan dan pengiriman
					const ordererCustomer = row.Pemesan;
					const deliveryTargetCustomer = row["Pelanggan Tujuan"];
					const deliveryPlace = row["Lokasi Pengiriman"];
					const salesChannel = row["Channel Penjualan"];

					// Data Product
					const productList = row["Produk & Qty"] as string;
					console.log({ productList });
					const products = productList?.includes("\n")
						? productList
								.split("\n")
								.map((item) => {
									const match = item.match(/(.*?)\s*\(SKU:\s*([^)]+)\)\s*x(\d+)/);
									if (!match) return null;

									const [_, productName, skuList, quantity] = match;
									const skus = skuList.split(",").map((sku) => sku.trim());

									return {
										productName: productName.trim(),
										skus,
										quantity: Number.parseInt(quantity),
									};
								})
								.filter(Boolean)
						: productList
							? (() => {
									const match = productList.match(/(.*?)\s*\(SKU:\s*([^)]+)\)\s*x(\d+)/);
									if (!match) return [];

									const [_, productName, skuList, quantity] = match;
									const skus = skuList.split(",").map((sku) => sku.trim());

									return [
										{
											productName: productName.trim(),
											skus,
											quantity: Number.parseInt(quantity),
										},
									];
								})()
							: [];

					console.log({ products });

					// Data pembayaran
					const paymentStatus = row["Status Pembayaran"] as PaymentStatus;
					const paymentDate = row["Tanggal Pembayaran"] || null;
					const paymentMethod = row["Metode Pembayaran"];

					// Data biaya dan diskon
					const finalPrice = Number(row["Total Keseluruhan"]);
					const otherFeesTotal = Number(row["Biaya Lainnya"]);
					const shippingCost = Number(row.Ongkir);
					const shippingType = row["Tipe Pengiriman"] as string;
					const shippingService = row["Layanan Pengiriman"] as string;

					// Menentukan tipe dan nilai diskon
					const discountType = row.Discount?.toString().includes("%") ? "percent" : "fixed";
					const discountValue = Number(row.Discount?.toString().replace("%", ""));

					// Membuat objek otherFees sebagai JSON
					const otherFees = {
						total: otherFeesTotal || 0,
						discount: {
							type: discountType || 0,
							value: discountValue || 0,
						},
						shippingCost: {
							cost: shippingCost || 0,
							type: shippingType || "reguler",
							shippingService: shippingService || "",
						},
					};

					// Mengembalikan objek order yang sesuai dengan Prisma OrderWhereInput
					const data = {
						orderDate: orderDate,
						note: note,
						OrdererCustomer: ordererCustomer as string,
						DeliveryTargetCustomer: deliveryTargetCustomer as string,
						DeliveryPlace: deliveryPlace as string,
						SalesChannel: salesChannel as string,
						OrderDetail: {
							code: orderCode,
							paymentStatus: paymentStatus,
							paymentDate: paymentDate,
							PaymentMethod: paymentMethod as string,
							finalPrice: finalPrice,
							receiptNumber: row["Nomor Resi"] as string,
							OrderProducts: products,
							otherFees: otherFees,
						},
						ShippingServices: {
							serviceName: shippingService,
							type: shippingType,
							shippingCost: shippingCost,
						},
					};

					return data as T;
				},
				async (data) => {
					for (const item of data) {
						console.log(item);
						console.log(item.OrderDetail?.code);
						const existingOrder = await prismaClient().orderDetail.findFirst({
							where: {
								code: item.OrderDetail?.code,
							},
						});

						// Skip jika order dengan kode yang sama sudah ada
						if (existingOrder) {
							console.log(`Order dengan kode ${item.OrderDetail?.code} sudah ada, dilewati.`);
							continue;
						}

						// TODO: orderer customer
						// Cari atau buat orderer customer
						const ordererCustomer = await prismaClient().customer.findFirst({
							where: {
								name: {
									equals: item.OrdererCustomer as string,
									mode: "insensitive",
								},
							},
						});

						let ordererCustomerId = ordererCustomer?.id;
						if (!ordererCustomer) {
							const newOrdererCustomer = await prismaClient().customer.create({
								data: {
									id: uuidv4(),
									name: item.OrdererCustomer as string,
									category: "CUSTOMER" as CustomerCategories,
									status: "ACTIVE",
									address: "",
									province: "",
									district: "",
									village: "",
									postalCode: "",
									phoneNumber: "",
									email: "",
								},
							});
							ordererCustomerId = newOrdererCustomer.id;
						}

						// Cari atau buat delivery target customer
						const deliveryTargetCustomer = await prismaClient().customer.findFirst({
							where: {
								name: {
									equals: item.DeliveryTargetCustomer as string,
									mode: "insensitive",
								},
							},
						});

						let deliveryTargetCustomerId = deliveryTargetCustomer?.id;
						if (!deliveryTargetCustomer) {
							const newDeliveryTargetCustomer = await prismaClient().customer.create({
								data: {
									id: uuidv4(),
									name: item.DeliveryTargetCustomer as string,
									category: "CUSTOMER" as CustomerCategories,
									status: "ACTIVE",
									address: "",
									province: "",
									district: "",
									village: "",
									postalCode: "",
									phoneNumber: "",
									email: "",
								},
							});
							deliveryTargetCustomerId = newDeliveryTargetCustomer.id;
						}

						// Cari atau buat delivery place
						const deliveryPlace = await prismaClient().deliveryPlace.findFirst({
							where: {
								name: {
									equals: item.DeliveryPlace as string,
									mode: "insensitive",
								},
							},
						});

						let deliveryPlaceId = deliveryPlace?.id;
						if (!deliveryPlace) {
							const newDeliveryPlace = await prismaClient().deliveryPlace.create({
								data: {
									id: uuidv4(),
									name: item.OrdererCustomer as string,
									address: "",
									subdistrict: "",
									phoneNumber: "",
									email: "",
								},
							});
							deliveryPlaceId = newDeliveryPlace.id;
						}

						// Cari atau buat sales channel
						const salesChannel = await prismaClient().salesChannel.findFirst({
							where: {
								name: {
									equals: item.SalesChannel as string,
									mode: "insensitive",
								},
							},
						});

						let salesChannelId = salesChannel?.id;
						if (!salesChannel) {
							const newSalesChannel = await prismaClient().salesChannel.create({
								data: {
									id: uuidv4(),
									name: item.SalesChannel as string,
									isActive: true,
								},
							});
							salesChannelId = newSalesChannel.id;
						}

						// Cari atau buat payment method
						const paymentMethod = await prismaClient().paymentMethod.findFirst({
							where: {
								name: {
									equals: item.OrderDetail?.PaymentMethod as string,
									mode: "insensitive",
								},
							},
						});

						let paymentMethodId = paymentMethod?.id;
						if (!paymentMethod) {
							const newPaymentMethod = await prismaClient().paymentMethod.create({
								data: {
									id: uuidv4(),
									name: null,
									bankName: item.OrderDetail?.PaymentMethod as string,
									bankBranch: null,
									accountNumber: null,
								},
							});
							paymentMethodId = newPaymentMethod.id;
						}

						// Cari atau buat produk dan variannya
						const products = await Promise.all(
							(item.OrderDetail?.OrderProducts as { productName: string; skus: string[]; quantity: number }[])?.map(
								async (product: { productName: string; skus: string[]; quantity: number }) => {
									const foundProduct = await prismaClient().product.findFirst({
										where: {
											AND: [
												{
													name: {
														equals: product.productName,
														mode: "insensitive",
													},
												},
												{
													productVariants: {
														some: {
															sku: {
																in: product.skus,
															},
														},
													},
												},
											],
										},
										include: {
											productVariants: {
												where: {
													sku: {
														in: product.skus,
													},
												},
											},
										},
									});

									let productId = foundProduct?.id;
									if (!foundProduct) {
										const newProduct = await prismaClient().product.create({
											data: {
												id: uuidv4(),
												name: product.productName,
												type: "BARANG_STOK_SENDIRI",
												productVariants: {
													create: product.skus.map((sku: string) => ({
														id: uuidv4(),
														sku: sku,
														stock: 0,
													})),
												},
											},
										});
										productId = newProduct.id;
									}

									return {
										productId: productId,
										productQty: product.quantity,
									};
								},
							),
						);

						// Buat order dan order detail
						const generated_order_id = uuidv4();
						const generated_order_detail_id = uuidv4();

						await prismaClient().order.create({
							data: {
								id: generated_order_id,
								ordererCustomerId: ordererCustomerId,
								deliveryTargetCustomerId: deliveryTargetCustomerId,
								deliveryPlaceId: deliveryPlaceId,
								salesChannelId: salesChannelId,
								orderDate: item.orderDate
									? item.orderDate instanceof Date
										? item.orderDate
										: typeof item.orderDate === "string" && item.orderDate.includes("/")
											? new Date(
													`20${item.orderDate.split("/")[2]}-${item.orderDate.split("/")[1]}-${item.orderDate.split("/")[0]}`,
												)
											: new Date(item.orderDate as string)
									: new Date(),
								note: (item.note as string) || "",
								OrderDetail: {
									create: {
										id: generated_order_detail_id,
										code: item.OrderDetail?.code as string,
										paymentStatus: (item.OrderDetail?.paymentStatus as PaymentStatus) || "PENDING",
										paymentDate:
											item.OrderDetail?.paymentDate instanceof Date
												? item.OrderDetail?.paymentDate
												: typeof item.OrderDetail?.paymentDate === "string" &&
														item.OrderDetail?.paymentDate.includes("/")
													? new Date(
															`20${item.OrderDetail?.paymentDate.split("/")[2]}-${item.OrderDetail?.paymentDate.split("/")[1]}-${item.OrderDetail?.paymentDate.split("/")[0]}`,
														)
													: item.OrderDetail?.paymentDate
														? new Date(item.OrderDetail?.paymentDate as string)
														: null,
										paymentMethodId: paymentMethodId,
										finalPrice: (item.OrderDetail?.finalPrice as number) || 0,
										receiptNumber: (item.OrderDetail?.receiptNumber as string) || null,
										otherFees: item.OrderDetail?.otherFees as Prisma.InputJsonValue | undefined,
										OrderProducts: {
											create: products.map((product) => ({
												orderId: generated_order_id,
												Product: {
													connect: {
														id: product.productId,
													},
												},
												productQty: product.productQty,
											})),
										},
									},
								},
							},
						});
					}
				},
			);

			if (!importResult.success || importResult.statusCode !== StatusCodes.OK) {
				return ServiceResponse.failure(
					`Gagal mengimpor data: ${importResult.message}`,
					null,
					importResult.statusCode || StatusCodes.BAD_REQUEST,
				);
			}

			return ServiceResponse.success("Berhasil mengimpor data order", importResult.responseObject, StatusCodes.OK);
		} catch (error) {
			logger.error(error);
			return ServiceResponse.failure("Gagal mengimpor data order", null, StatusCodes.INTERNAL_SERVER_ERROR);
		}
	};

	public cancelOrders = async (id: string) => {
		try {
			const existingOrder = await prismaClient().order.findUnique({
				where: { id },
				include: {
					OrderDetail: {
						include: {
							OrderProducts: true,
						},
					},
					ShippingServices: true,
				},
			});

			if (!existingOrder?.OrderDetail?.id) {
				return ServiceResponse.failure("Order detail tidak ditemukan", null, StatusCodes.NOT_FOUND);
			}

			const updatedOrder = await prismaClient().$transaction(async (prisma) => {
				// Update order status to CANCEL
				const updatedOrderDetail = await prisma.orderDetail.update({
					where: { id: existingOrder.OrderDetail?.id ?? "" },
					data: {
						paymentStatus: PaymentStatus.CANCEL,
					},
				});

				// Return stock to product variants
				if (existingOrder?.OrderDetail?.OrderProducts && existingOrder.OrderDetail.OrderProducts.length > 0) {
					for (const orderProduct of existingOrder.OrderDetail.OrderProducts) {
						// Dapatkan produk dan variannya
						const product = await prisma.product.findUnique({
							where: { id: orderProduct.productId },
							include: { productVariants: true },
						});

						if (product?.productVariants && product.productVariants.length > 0) {
							// Kembalikan stok ke varian produk
							for (const variant of product.productVariants) {
								await prisma.productVariant.update({
									where: { id: variant.id },
									data: {
										stock: {
											increment: orderProduct.productQty,
										},
									},
								});
							}
						}
					}
				}

				return updatedOrderDetail;
			});

			return ServiceResponse.success("Berhasil membatalkan pesanan", updatedOrder, StatusCodes.OK);
		} catch (error) {
			logger.error(error);
			return ServiceResponse.failure(
				"Gagal membatalkan data order",
				(error as Error).message,
				StatusCodes.INTERNAL_SERVER_ERROR,
			);
		}
	};

	public getSummary = async (query: OrderQueryType["query"]) => {
		try {
			type OrderFilter = Prisma.OrderWhereInput;

			console.log("==========QUERY=========");
			console.log(query);
			console.log("=========================");

			const filter: OrderFilter = {};

			const queryParams = {
				salesChannelId: query.salesChannelId as string | undefined,
				customerCategory: query.customerCategory as string | undefined,
				paymentStatus: query.paymentStatus as PaymentStatus | undefined,
				productId: query.productId as string | undefined,
				paymentMethodId: query.paymentMethodId as string | undefined,
				orderDate: query.orderDate as string | undefined,
				orderMonth: query.orderMonth as string | undefined,
				orderYear: query.orderYear as string | undefined,
				startDate: query.startDate as string | undefined,
				endDate: query.endDate as string | undefined,
				ordererCustomerId: query.ordererCustomerId as string | undefined,
				deliveryTargetCustomerId: query.deliveryTargetCustomerId as string | undefined,
				deliveryPlaceId: query.deliveryPlaceId as string | undefined,
				orderStatus: query.orderStatus as string | undefined,
				search: query.search as string | undefined,
				sort: query.sort as string | undefined,
				order: query.order as "asc" | "desc" | undefined,
			};

			// Filter berdasarkan sales channel
			if (queryParams.salesChannelId) {
				filter.salesChannelId = queryParams.salesChannelId;
			}

			// Filter berdasarkan tanggal order
			if (queryParams.orderDate) {
				const date = new Date(queryParams.orderDate);
				filter.orderDate = {
					gte: new Date(date.setHours(0, 0, 0, 0)),
					lte: new Date(date.setHours(23, 59, 59, 999)),
				};
			}

			// Filter berdasarkan bulan dan tahun
			if (queryParams.orderMonth) {
				const month = Number.parseInt(queryParams.orderMonth);
				filter.orderDate = {
					gte: new Date(new Date().getFullYear(), month - 1, 1),
					lte: new Date(new Date().getFullYear(), month, 0, 23, 59, 59, 999),
				};
			}

			if (queryParams.orderYear) {
				// Filter hanya berdasarkan tahun
				const year = Number.parseInt(queryParams.orderYear);
				filter.orderDate = {
					gte: new Date(year, 0, 1),
					lte: new Date(year, 11, 31, 23, 59, 59, 999),
				};
			}

			// Filter berdasarkan range tanggal
			if (queryParams.startDate && queryParams.endDate) {
				filter.orderDate = {
					gte: new Date(new Date(queryParams.startDate).setHours(0, 0, 0, 0)),
					lte: new Date(new Date(queryParams.endDate).setHours(23, 59, 59, 999)),
				};
			}

			// Filter berdasarkan kategori customer
			if (queryParams.customerCategory) {
				filter.OR = [
					{
						OrdererCustomer: {
							is: { category: { equals: queryParams.customerCategory as CustomerCategories } },
						},
					},
					{
						DeliveryTargetCustomer: {
							is: { category: { equals: queryParams.customerCategory as CustomerCategories } },
						},
					},
				];
			}

			// Filter berdasarkan orderer customer
			if (queryParams.ordererCustomerId) {
				filter.ordererCustomerId = queryParams.ordererCustomerId;
			}

			// Filter berdasarkan delivery target customer
			if (queryParams.deliveryTargetCustomerId) {
				filter.deliveryTargetCustomerId = queryParams.deliveryTargetCustomerId;
			}

			// Filter berdasarkan delivery place
			if (queryParams.deliveryPlaceId) {
				filter.deliveryPlaceId = queryParams.deliveryPlaceId;
			}

			// Filter berdasarkan status order
			if (queryParams.orderStatus) {
				// Validasi nilai status order
				const validPaymentStatuses = ["settlement", "pending", "cancel", "installments"];
				const paymentStatus = validPaymentStatuses.includes(queryParams.orderStatus)
					? (queryParams.orderStatus as PaymentStatus)
					: undefined;

				if (paymentStatus) {
					if (filter.OrderDetail) {
						filter.OrderDetail.paymentStatus = paymentStatus;
					} else {
						filter.OrderDetail = {
							paymentStatus: paymentStatus,
						};
					}
				}
			}

			const result = await prismaClient().order.findMany({
				where: filter,
				include: {
					SalesChannel: true,
					DeliveryPlace: true,
					OrdererCustomer: true,
					DeliveryTargetCustomer: true,
					OrderDetail: {
						include: {
							OrderProducts: {
								where: queryParams.productId ? { productId: queryParams.productId } : undefined,
								include: {
									Product: {
										include: {
											productVariants: true,
										},
									},
								},
							},
							PaymentMethod:
								queryParams.paymentMethodId || queryParams.paymentStatus
									? {
											where: {
												...(queryParams.paymentMethodId && { id: queryParams.paymentMethodId }),
												...(queryParams.paymentStatus && { status: queryParams.paymentStatus }),
											},
										}
									: true,
						},
					},
					ShippingServices: true,
				},
			});

			// Filter hasil jika ada filter untuk payment method atau product
			let filteredResult = result;

			if (queryParams.paymentMethodId || queryParams.paymentStatus) {
				filteredResult = result.filter((order) => order.OrderDetail && order.OrderDetail.PaymentMethod !== null);
			}

			if (queryParams.productId) {
				filteredResult = filteredResult.filter(
					(order) => order.OrderDetail && order.OrderDetail.OrderProducts.length > 0,
				);
			}

			return ServiceResponse.success("Berhasil mengambil data order", filteredResult, StatusCodes.OK);
		} catch (error) {
			logger.error(error);
			return ServiceResponse.failure("Gagal mengambil data order", null, StatusCodes.INTERNAL_SERVER_ERROR);
		}
	};
}

export const orderService = new OrderService();
