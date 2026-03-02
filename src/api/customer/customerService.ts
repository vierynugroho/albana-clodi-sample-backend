import { URLSearchParams } from "node:url";
import { ServiceResponse } from "@/common/models/serviceResponse";
import { exportData } from "@/common/utils/dataExporter";
import { importData } from "@/common/utils/dataImporter";
import { prismaClient } from "@/config/prisma";
import { StatusCodes } from "http-status-codes";
import type {
  Customer,
  CustomerCategories,
  CustomerStatuses,
  Prisma,
} from "../../../generated/prisma";
import type {
  CreateCustomerType,
  DeleteCustomerSchema,
  RequestQueryCustomerType,
  UpdateCustomerType,
} from "./customerModel";

export class CustomerService {
  public getAllCustomers = async (reqQuery: RequestQueryCustomerType) => {
    try {
      const {
        page: rawPage = 1,
        limit: rawLimit = 10,
        category,
        sort,
        status,
        search,
        order,
        startDate,
        endDate,
        month,
        year,
        week,
      } = reqQuery;
      const page = Number(rawPage) || 1;
      const limit = Number(rawLimit) || 10;
      const skip = (page - 1) * limit;
      const query: Prisma.CustomerFindManyArgs = {};
      const sortableFields = ["createdAt", "name", "email"];

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

      // TODO:: filter berdasarkan nama alamat no hp
      if (search) {
        query.where = {
          ...query.where,
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
            { phoneNumber: { contains: search, mode: "insensitive" } },
            { address: { contains: search, mode: "insensitive" } },
          ],
        };
      }

      if (category) {
        query.where = {
          ...query.where,
          category: category as CustomerCategories,
        };
      }

      if (status) {
        query.where = {
          ...query.where,
          status: status as CustomerStatuses,
        };
      }

      if (sort && sortableFields.includes(sort)) {
        query.orderBy = {
          [sort]: order,
        };
      } else {
        query.orderBy = {
          createdAt: "desc",
        };
      }

      const [customers, total] = await Promise.all([
        prismaClient().customer.findMany({
          where: query.where,
          orderBy: query.orderBy,
          skip,
          take: limit,
        }),
        prismaClient().customer.count(),
      ]);

      const response: PaginatedResponse<Customer> = {
        data: customers as unknown as Customer[],
        meta: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalItems: total,
        },
      };
      return ServiceResponse.success(
        "Customers retrieved successfully",
        response,
        StatusCodes.OK,
      );
    } catch (ex) {
      const errorMessage = `Error create customer: ${(ex as Error).message}`;
      return ServiceResponse.failure(
        "An error occurred while create customer.",
        errorMessage,
        StatusCodes.INTERNAL_SERVER_ERROR,
      );
    }
  };

  public getDetailCustomer = async (customerId: string) => {
    try {
      const foundCustomer = await prismaClient().customer.findFirst({
        where: { id: customerId },
      });
      if (!foundCustomer) {
        return ServiceResponse.failure(
          "Customer not found",
          null,
          StatusCodes.NOT_FOUND,
        );
      }

      return ServiceResponse.success(
        "Customer retrieved successfully",
        foundCustomer,
        StatusCodes.OK,
      );
    } catch (ex) {
      const errorMessage = `Error detail customer: ${(ex as Error).message}`;
      return ServiceResponse.failure(
        "An error occurred while detail customer.",
        errorMessage,
        StatusCodes.INTERNAL_SERVER_ERROR,
      );
    }
  };

  public createCustomer = async (req: CreateCustomerType) => {
    try {
      const foundCustomer = await prismaClient().customer.findFirst({
        where: {
          OR: [{ email: req.email }, { phoneNumber: req.phoneNumber }],
        },
      });
      if (foundCustomer) {
        return ServiceResponse.failure(
          "Phone number or email already in use",
          null,
          StatusCodes.BAD_REQUEST,
        );
      }

      const destinationId = await this.getDestinationIdFromAPI(
        req.village,
        req.district,
        req.city,
        req.postalCode,
      );
      const response = await prismaClient().customer.create({
        data: { ...req, destinationId },
      });

      return ServiceResponse.success(
        "Customer created successfully",
        response,
        StatusCodes.CREATED,
      );
    } catch (ex) {
      const errorMessage = `Error create customer: ${(ex as Error).message}`;
      return ServiceResponse.failure(
        "An error occurred while create customer.",
        errorMessage,
        StatusCodes.INTERNAL_SERVER_ERROR,
      );
    }
  };

  public updateCustomer = async (
    customerId: string,
    req: UpdateCustomerType,
  ) => {
    try {
      const foundCustomer = await prismaClient().customer.findFirst({
        where: {
          id: customerId,
        },
      });
      if (!foundCustomer) {
        return ServiceResponse.failure(
          "Customer not found",
          null,
          StatusCodes.BAD_REQUEST,
        );
      }

      const response = await prismaClient().customer.update({
        where: { id: customerId },
        data: req as Prisma.CustomerUpdateInput,
      });

      return ServiceResponse.success(
        "Customer updated successfully",
        response,
        StatusCodes.OK,
      );
    } catch (ex) {
      const errorMessage = `Error update customer: ${(ex as Error).message}`;
      return ServiceResponse.failure(
        "An error occurred while update customer.",
        errorMessage,
        StatusCodes.INTERNAL_SERVER_ERROR,
      );
    }
  };

  public deleteCustomer = async (
    customerId: string,
    req: DeleteCustomerSchema,
  ) => {
    try {
      let responses: Customer[];
      if (
        req &&
        Array.isArray(req.customerIds) &&
        req.customerIds?.length > 0
      ) {
        responses = await prismaClient().customer.findMany({
          where: {
            id: {
              in: req.customerIds,
            },
          },
        });
        if (!responses.length) {
          return ServiceResponse.failure(
            "Customers not found",
            null,
            StatusCodes.NOT_FOUND,
          );
        }

        await prismaClient().customer.deleteMany({
          where: { id: { in: req.customerIds } },
        });
      } else {
        responses = (await prismaClient().customer.findUnique({
          where: { id: customerId },
        })) as unknown as Customer[];
        if (!responses) {
          return ServiceResponse.failure(
            "Customer not found",
            null,
            StatusCodes.NOT_FOUND,
          );
        }

        await prismaClient().customer.delete({ where: { id: customerId } });
      }

      return ServiceResponse.failure(
        "Customer deleted successfully",
        responses,
        StatusCodes.OK,
      );
    } catch (ex) {
      const errorMessage = `Error delete customer: ${(ex as Error).message}`;
      return ServiceResponse.failure(
        "An error occurred while delete customer.",
        errorMessage,
        StatusCodes.INTERNAL_SERVER_ERROR,
      );
    }
  };

  private getDestinationIdFromAPI = async (
    village: string,
    district: string,
    city: string,
    postalCode: string | undefined,
  ) => {
    const API_KEY = process.env.RAJAONGKIR_SHIPPING_DELIVERY_API_KEY;
    const BASE_URL = process.env.RAJAONGKIR_BASE_URL;

    const removePrefix = (text: string): string => {
      const prefixes = ["Kota", "Kabupaten", "Kecamatan", "Kelurahan"];
      const result = text.trim();

      for (const prefix of prefixes) {
        if (result.toLowerCase().startsWith(prefix.toLowerCase())) {
          return result.slice(prefix.length).trim();
        }
      }

      return result;
    };

    const cleanVillage = removePrefix(village);
    const cleanDistrict = removePrefix(district);
    const cleanCity = removePrefix(city);

    // Buat array untuk keyword
    const keywordParts = [cleanVillage, cleanDistrict, cleanCity].filter(
      (v) => v !== null && v !== undefined && v !== "",
    );

    // Tambahkan kode pos jika ada
    if (postalCode !== undefined && postalCode !== null) {
      keywordParts.push(postalCode);
    }

    // Format keyword seperti contoh: "Purwokerto, Srengat, Blitar, 12345"
    const keyword = keywordParts.join(", ");

    const query = new URLSearchParams();
    query.append("keyword", keyword);

    const response = await fetch(
      `${BASE_URL}/destination/search?${query.toString()}`,
      {
        method: "GET",
        headers: {
          "x-api-key": API_KEY as string,
        },
      },
    );

    console.log({ response, query });

    const data = await response.json();
    return data.data.length === 1 ? data.data[0].id : null;
  };

  public exportCustomers = async (reqQuery: RequestQueryCustomerType) => {
    try {
      const exportParams = {
        ...reqQuery,
        startDate: reqQuery.startDate
          ? new Date(reqQuery.startDate).toISOString()
          : undefined,
        endDate: reqQuery.endDate
          ? new Date(reqQuery.endDate).toISOString()
          : undefined,
      };

      return exportData<Customer>(
        exportParams,
        async (where) => {
          return prismaClient().customer.findMany({
            where: where as Prisma.CustomerWhereInput,
            orderBy: { createdAt: "desc" },
          });
        },
        (customer: Customer, index) => ({
          No: index + 1,
          Nama: customer.name ?? null,
          Kategori: customer.category ?? null,
          Alamat: customer.address ?? null,
          Provinsi: customer.province ?? null,
          "Kota/Kab": customer.city ?? null,
          Kecamatan: customer.district ?? null,
          Kelurahan: customer.village ?? null,
          "Kode Pos": customer.postalCode ?? null,
          Email: customer.email ?? null,
          "No. Telpon": customer.phoneNumber ?? null,
        }),
        "Customer",
        "Tidak ada data customer untuk diekspor",
      );
    } catch (ex: unknown) {
      const errorMessage = `Error export customers: ${(ex as Error).message}`;
      return ServiceResponse.failure(
        "An error occurred while export customers.",
        errorMessage,
        StatusCodes.INTERNAL_SERVER_ERROR,
      );
    }
  };

  public importCustomers = async (file: Buffer) => {
    try {
      const importResult = await importData<Prisma.CustomerCreateInput>(
        file,
        (row, index) => ({
          name: (row.Nama as string).toString() ?? null,
          province: (row.Provinsi as string) ?? null,
          city: (row["Kota/Kab"] as string) ?? null,
          district: (row.Kecamatan as string) ?? null,
          village: (row.Kelurahan as string) ?? null,
          address: (row.Alamat as string) ?? null,
          category: (row.Kategori === "Pelanggan"
            ? "CUSTOMER"
            : ((row.Kategori as CustomerCategories).toUpperCase() ??
              null)) as CustomerCategories,
          email: (row.Email as string) ?? null,
          postalCode: row["Kode Pos"] ? String(row["Kode Pos"]) : null,
          phoneNumber: row["No. Telpon"] ? String(row["No. Telpon"]) : null,
        }),
        async (data) => {
          return prismaClient().customer.createMany({
            data,
            skipDuplicates: true,
          });
        },
      );

      return ServiceResponse.success(
        "Berhasil mengimpor data customers",
        importResult.responseObject,
        StatusCodes.OK,
      );
    } catch (ex: unknown) {
      const errorMessage = `Error import customers: ${(ex as Error).message}`;
      return ServiceResponse.failure(
        "An error occurred while import customers.",
        errorMessage,
        StatusCodes.INTERNAL_SERVER_ERROR,
      );
    }
  };
}

export const customerService = new CustomerService();
