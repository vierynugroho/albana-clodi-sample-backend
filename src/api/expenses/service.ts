import { ServiceResponse } from "@/common/models/serviceResponse";
import { exportData } from "@/common/utils/dataExporter";
import { importData } from "@/common/utils/dataImporter";
import { prismaClient } from "@/config/prisma";
import { logger } from "@/server";
import { StatusCodes } from "http-status-codes";
import type { Expense, Prisma } from "../../../generated/prisma";
import type { CreateExpensesType, UpdateExpensesType } from "./model";

interface GetAllExpensesParams {
  startDate?: string;
  endDate?: string;
  month?: string;
  year?: string;
  week?: string;
  keyword?: string;
}

class ExpenseService {
  public createExpense = async (data: CreateExpensesType["body"]) => {
    try {
      const itemPrice = data?.itemPrice || 0;
      const qty = data?.qty || 0;
      const totalPrice = itemPrice * qty;
      const expenseDate = data.expenseDate
        ? new Date(data.expenseDate)
        : undefined;

      const result = await prismaClient().expense.create({
        data: {
          ...data,
          expenseDate,
          totalPrice,
        },
      });

      return ServiceResponse.success(
        "Berhasil menambahkan data pengeluaran",
        result,
        StatusCodes.CREATED,
      );
    } catch (error) {
      logger.error(error);
      return ServiceResponse.failure(
        "Gagal menambahkan data pengeluaran",
        null,
        StatusCodes.INTERNAL_SERVER_ERROR,
      );
    }
  };

  public updateExpense = async (
    id: string,
    data: Partial<UpdateExpensesType["body"]>,
  ) => {
    try {
      const itemPrice = data?.itemPrice || 0;
      const qty = data?.qty || 0;
      const totalPrice = itemPrice * qty;
      const expenseDate = data.expenseDate
        ? new Date(data.expenseDate)
        : undefined;

      const updatedExpense = await prismaClient().expense.update({
        where: { id },
        data: {
          ...data,
          expenseDate,
          totalPrice,
          updatedAt: new Date(),
        },
      });

      return ServiceResponse.success(
        "Berhasil mengubah data pengeluaran",
        updatedExpense,
        StatusCodes.OK,
      );
    } catch (error) {
      logger.error(error);
      return ServiceResponse.failure(
        "Gagal mengubah data pengeluaran",
        null,
        StatusCodes.INTERNAL_SERVER_ERROR,
      );
    }
  };

  public deleteExpense = async (id: string) => {
    try {
      await prismaClient().expense.delete({
        where: { id },
      });

      return ServiceResponse.success(
        "Berhasil menghapus data pengeluaran",
        null,
        StatusCodes.OK,
      );
    } catch (error) {
      logger.error(error);
      return ServiceResponse.failure(
        "Gagal menghapus data pengeluaran",
        null,
        StatusCodes.INTERNAL_SERVER_ERROR,
      );
    }
  };

  public getExpenseDetail = async (id: string) => {
    try {
      const expense = await prismaClient().expense.findUnique({
        where: { id },
      });

      if (!expense) {
        return ServiceResponse.failure(
          "Data pengeluaran tidak ditemukan",
          null,
          StatusCodes.NOT_FOUND,
        );
      }

      return ServiceResponse.success(
        "Berhasil mendapatkan detail pengeluaran",
        expense,
        StatusCodes.OK,
      );
    } catch (error) {
      logger.error(error);
      return ServiceResponse.failure(
        "Gagal mendapatkan detail pengeluaran",
        null,
        StatusCodes.INTERNAL_SERVER_ERROR,
      );
    }
  };

  public getAllExpenses = async (params: GetAllExpensesParams) => {
    try {
      const { startDate, endDate, month, year, week, keyword } = params;

      let where: {
        createdAt?: { gte?: Date; lte?: Date; lt?: Date };
        personResponsible?: { contains?: string; mode?: "insensitive" };
        itemName?: { contains?: string; mode?: "insensitive" };
        OR?: Array<{
          personResponsible?: { contains?: string; mode?: "insensitive" };
          itemName?: { contains?: string; mode?: "insensitive" };
        }>;
      } = {};

      // Filter by date range
      if (startDate && endDate) {
        where = {
          ...where,
          createdAt: {
            ...(where.createdAt || {}),
            gte: new Date(`${startDate}T00:00:00`),
            lte: new Date(`${endDate}T23:59:59`),
          },
        };
      }

      if (month) {
        const monthNumber = Number.parseInt(month, 10);
        const yearValue = year
          ? Number.parseInt(year, 10)
          : new Date().getFullYear();

        where = {
          ...where,
          createdAt: {
            ...(where.createdAt || {}),
            gte: new Date(yearValue, monthNumber - 1, 1, 0, 0, 0),
            lte: new Date(yearValue, monthNumber, 0, 23, 59, 59),
          },
        };
      }

      if (year && !month && !week) {
        const yearNumber = Number.parseInt(year, 10);
        console.log(yearNumber);
        where = {
          ...where,
          createdAt: {
            ...(where.createdAt || {}),
            gte: new Date(yearNumber, 0, 1),
            lt: new Date(yearNumber + 1, 0, 1),
          },
        };
      }

      if (week) {
        const weekNumber = Number.parseInt(week, 10);
        const yearNumber = year
          ? Number.parseInt(year, 10)
          : new Date().getFullYear();

        const firstDayOfYear = new Date(yearNumber, 0, 1);

        const daysToAdd = (weekNumber - 1) * 7;

        // Calculate start and end dates for the week
        const weekStart = new Date(firstDayOfYear);
        weekStart.setDate(firstDayOfYear.getDate() + daysToAdd);

        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);

        where = {
          ...where,
          createdAt: {
            ...(where.createdAt || {}),
            gte: weekStart,
            lte: weekEnd,
          },
        };
      }

      if (keyword) {
        where = {
          ...where,
          OR: [
            {
              personResponsible: {
                contains: keyword,
                mode: "insensitive",
              },
            },
            {
              itemName: {
                contains: keyword,
                mode: "insensitive",
              },
            },
          ],
        };
      }

      console.log(where);
      const [expenses, totalExpenses, count] = await Promise.all([
        prismaClient().expense.findMany({
          where: where as Prisma.ExpenseWhereInput,
          orderBy: {
            createdAt: "desc" as const,
          },
        }),
        prismaClient().expense.aggregate({
          where: where as Prisma.ExpenseWhereInput,
          _sum: {
            totalPrice: true,
          },
        }),
        prismaClient().expense.count({
          where: where as Prisma.ExpenseWhereInput,
        }),
      ]);

      // Mendapatkan informasi filter yang digunakan
      let filterInfo = "Semua data";
      if (startDate && endDate) {
        filterInfo = `Data dari ${startDate} sampai ${endDate}`;
      } else if (month && year) {
        const monthNames = [
          "Januari",
          "Februari",
          "Maret",
          "April",
          "Mei",
          "Juni",
          "Juli",
          "Agustus",
          "September",
          "Oktober",
          "November",
          "Desember",
        ];
        filterInfo = `Data bulan ${monthNames[Number(month) - 1]} ${year}`;
      } else if (year) {
        filterInfo = `Data tahun ${year}`;
      } else if (week) {
        filterInfo = `Data minggu ke-${week} tahun ${year || new Date().getFullYear()}`;
      }

      return ServiceResponse.success(
        "Berhasil mendapatkan data pengeluaran",
        {
          filterInfo,
          totalExpenses: totalExpenses._sum.totalPrice || 0,
          totalData: count,
          data: expenses,
        },
        StatusCodes.OK,
      );
    } catch (error) {
      logger.error(error);
      return ServiceResponse.failure(
        "Gagal mendapatkan data pengeluaran",
        null,
        StatusCodes.INTERNAL_SERVER_ERROR,
      );
    }
  };

  public exportExpenses = async (params: GetAllExpensesParams) => {
    try {
      const formatter = new Intl.DateTimeFormat("id-ID", {
        timeZone: "Asia/Jakarta",
        dateStyle: "short",
      });

      const exportParams = {
        ...params,
        startDate: params.startDate
          ? new Date(params.startDate).toISOString()
          : undefined,
        endDate: params.endDate
          ? new Date(params.endDate).toISOString()
          : undefined,
      };

      return exportData<Expense>(
        exportParams,
        async (where) => {
          return prismaClient().expense.findMany({
            where: where as Prisma.ExpenseWhereInput,
            orderBy: { createdAt: "desc" },
          });
        },
        (expense, index) => ({
          No: index + 1,
          "Nama Item": expense.itemName ?? "",
          "Harga Item": expense.itemPrice ?? "",
          Jumlah: expense.qty ?? 0,
          "Total Harga": expense.totalPrice ?? 0,
          "Penanggung Jawab": expense.personResponsible ?? "",
          Catatan: expense.note ?? "",
          "Tanggal Pengeluaran": expense.expenseDate
            ? formatter.format(new Date(expense.expenseDate))
            : "",
          "Tanggal Dibuat": expense.createdAt
            ? formatter.format(new Date(expense.createdAt))
            : "",
        }),
        "Pengeluaran",
        "Tidak ada data pengeluaran untuk diekspor",
      );
    } catch (error) {
      logger.error(error);
      return ServiceResponse.failure(
        "Gagal mengekspor data pengeluaran",
        null,
        StatusCodes.INTERNAL_SERVER_ERROR,
      );
    }
  };

  public importExpenses = async (file: Buffer) => {
    try {
      const importResult = await importData<Prisma.ExpenseCreateInput>(
        file,
        (row, index) => ({
          itemName: row["Nama Item"] as string,
          itemPrice: Number(row["Harga Item"]),
          qty: Number(row.Jumlah),
          totalPrice: Number(row["Total Harga"]),
          personResponsible: row["Penanggung Jawab"] as string,
          note: row.Catatan as string,
          expenseDate:
            row["Tanggal Pengeluaran"] && row["Tanggal Pengeluaran"] !== ""
              ? (() => {
                  try {
                    const dateParts = String(row["Tanggal Pengeluaran"]).split(
                      "/",
                    );
                    if (dateParts.length === 3) {
                      // Format dd/mm/yyyy to yyyy-mm-dd
                      const day = dateParts[0].padStart(2, "0");
                      const month = dateParts[1].padStart(2, "0");
                      const year =
                        dateParts[2].length === 2
                          ? `20${dateParts[2]}`
                          : dateParts[2];
                      return new Date(`${year}-${month}-${day}`);
                    }
                    return new Date(String(row["Tanggal Pengeluaran"]));
                  } catch (error) {
                    return null;
                  }
                })()
              : null,
        }),
        async (data) => {
          // Validasi data sebelum menyimpan ke database
          const validatedData = data.filter((item) => {
            if (!item.itemName || !item.itemPrice || !item.qty) {
              return false;
            }

            if (
              Number.isNaN(Number(item.itemPrice)) ||
              Number.isNaN(Number(item.qty))
            ) {
              return false;
            }

            return true;
          });

          return prismaClient().expense.createMany({
            data: validatedData,
            skipDuplicates: true,
          });
        },
      );

      if (!importResult.success || importResult.statusCode !== StatusCodes.OK) {
        return ServiceResponse.failure(
          `Gagal mengimpor data: ${importResult.message}`,
          null,
          importResult.statusCode || StatusCodes.BAD_REQUEST,
        );
      }

      return ServiceResponse.success(
        "Berhasil mengimpor data pengeluaran",
        importResult.responseObject,
        StatusCodes.OK,
      );
    } catch (error) {
      logger.error(error);
      return ServiceResponse.failure(
        "Gagal mengimpor data pengeluaran",
        null,
        StatusCodes.INTERNAL_SERVER_ERROR,
      );
    }
  };
}

export const expenseService = new ExpenseService();
