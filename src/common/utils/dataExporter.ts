import { ServiceResponse } from "@/common/models/serviceResponse";
import { logger } from "@/server";
import { StatusCodes } from "http-status-codes";
import xlsx from "xlsx";

interface ExportParams {
  startDate?: string;
  endDate?: string;
  month?: string;
  year?: string;
  week?: string;
}

/**
 * Fungsi untuk mengekspor data ke file Excel
 * @param params Parameter untuk filter data (tanggal mulai, tanggal akhir, bulan, tahun, minggu)
 * @param fetchData Fungsi untuk mengambil data dari database berdasarkan filter
 * @param mapFunction Fungsi untuk mengubah data dari database menjadi format yang sesuai untuk Excel
 * @param sheetName Nama sheet di file Excel (default: "Data")
 * @param emptyMessage Pesan yang ditampilkan jika tidak ada data (default: "Tidak ada data untuk diekspor")
 * @returns ServiceResponse dengan buffer file Excel dan nama file
 */
export const exportData = async <T>(
  params: ExportParams,
  fetchData: (where: Record<string, unknown>) => Promise<T[]>,
  mapFunction: (item: T, index: number) => Record<string, unknown>,
  sheetName = "Data",
  emptyMessage = "Tidak ada data untuk diekspor",
) => {
  try {
    const { startDate, endDate, month, year, week } = params;
    let where: { createdAt?: { gte?: Date; lte?: Date; lt?: Date } } = {};

    if (startDate && endDate) {
      where = {
        ...where,
        createdAt: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
      };
    }

    console.log({ where });

    if (month) {
      const monthNumber = Number.parseInt(month, 10) - 1;
      const yearNumber = year
        ? Number.parseInt(year, 10)
        : new Date().getFullYear();

      where = {
        ...where,
        createdAt: {
          ...(where.createdAt || {}),
          gte: new Date(yearNumber, monthNumber, 1),
          lt: new Date(yearNumber, monthNumber + 1, 1),
        },
      };
    }

    if (year && !month && !week) {
      const yearNumber = Number.parseInt(year, 10);

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

    const items = await fetchData(where);
    console.log({ items });

    if (!items.length) {
      return ServiceResponse.failure(emptyMessage, null, StatusCodes.NOT_FOUND);
    }

    const data = items.map(mapFunction);

    // Buat worksheet dan workbook
    const worksheet = xlsx.utils.json_to_sheet(data);
    const workbook = xlsx.utils.book_new();
    // Buat nama sheet dengan tambahan parameter yang digunakan
    let sheetNameWithParams = sheetName;

    if (year) {
      sheetNameWithParams += ` - ${year}`;
    }

    if (month) {
      const monthNames = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
      ];
      const monthNumber = Number.parseInt(month, 10);
      const monthName = monthNames[monthNumber - 1];
      sheetNameWithParams += year
        ? ` ${monthName}`
        : ` - ${monthName} ${new Date().getFullYear()}`;
    }

    if (week) {
      sheetNameWithParams += year
        ? ` Week ${week}`
        : ` - Week ${week} ${new Date().getFullYear()}`;
    }

    if (startDate && endDate) {
      // hanya ambil tanggal, bulan, tahun, nama tidak boleh lebih dari 31 char
      const start = new Date(startDate);
      const end = new Date(endDate);
      const startStr = `${start.getDate()}-${start.getMonth() + 1}-${start.getFullYear()}`;
      const endStr = `${end.getDate()}-${end.getMonth() + 1}-${end.getFullYear()}`;
      sheetNameWithParams += ` - ${startStr} to ${endStr}`;
    }

    xlsx.utils.book_append_sheet(workbook, worksheet, sheetNameWithParams);

    const buffer = xlsx.write(workbook, {
      type: "buffer",
      bookType: "xlsx",
    });

    // Tambahkan nama file yang sama dengan nama sheet
    const fileName = `${sheetNameWithParams.replace(/\s/g, "_")}.xlsx`;

    return ServiceResponse.success(
      "Berhasil mengekspor data",
      { buffer, fileName },
      StatusCodes.OK,
    );
  } catch (error) {
    console.error({ error });
    logger.error(error);
    return ServiceResponse.failure(
      "Gagal mengekspor data",
      null,
      StatusCodes.INTERNAL_SERVER_ERROR,
    );
  }
};

/**
 * Contoh penggunaan exportData:
 *
 * ! Contoh 1: Penggunaan di service
 *
 * ```typescript
 * // Di dalam service.ts
 * public exportExpenses = async (params: GetAllExpensesParams) => {
 *   const formatter = new Intl.DateTimeFormat("id-ID", {
 *     timeZone: "Asia/Jakarta",
 *     dateStyle: "short",
 *   });
 *
 *   return exportData<Expense>(
 *     params,
 *     async (where) => {
 *       return this.expenseRepo.client.expense.findMany({
 *         where: where as Prisma.ExpenseWhereInput,
 *         orderBy: { createdAt: "desc" },
 *       });
 *     },
 *     (expense, index) => ({
 *       No: index + 1,
 *       "Nama Item": expense.itemName ?? "",
 *       "Harga Item": expense.itemPrice ?? "",
 *       Jumlah: expense.qty ?? 0,
 *       "Total Harga": expense.totalPrice ?? 0,
 *       "Penanggung Jawab": expense.personResponsible ?? "",
 *       Catatan: expense.note ?? "",
 *       Tanggal: expense.createdAt ? formatter.format(new Date(expense.createdAt)) : "",
 *     }),
 *     "Pengeluaran",
 *     "Tidak ada data pengeluaran untuk diekspor"
 *   );
 * };
 * ```
 *
 * ! Contoh 2: Penggunaan di controller
 *
 * ```typescript
 * public exportData: RequestHandler = async (req: Request, res: Response) => {
 *   const { startDate, endDate, month, year, week } = req.query;
 *
 *   const serviceResponse = await someService.exportData({
 *     startDate: startDate as string,
 *     endDate: endDate as string,
 *     month: month as string,
 *     year: year as string,
 *     week: week as string,
 *   });
 *
 *   if (serviceResponse.success) {
 *     res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
 *     res.setHeader("Content-Disposition", "attachment; filename=data.xlsx");
 *     res.status(serviceResponse.statusCode).send(serviceResponse.responseObject?.buffer);
 *   } else {
 *     res.status(serviceResponse.statusCode).send(serviceResponse);
 *   }
 * };
 * ```
 */
