import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

export const ExpensesSchema = z.object({
  id: z.string().uuid().optional(),
  itemName: z.string().optional(),
  itemPrice: z.number().optional(),
  expenseDate: z.coerce.date().optional(),
  qty: z.number().int().optional(),
  personResponsible: z.string().optional(),
  note: z.string().optional(),
});

export type Expenses = z.infer<typeof ExpensesSchema>;

// Schema untuk create expense
export const CreateExpensesSchema = z.object({
	body: ExpensesSchema.omit({ id: true }),
});
export type CreateExpensesType = z.infer<typeof CreateExpensesSchema>;

// Schema untuk update expense
export const UpdateExpensesSchema = z.object({
	params: z.object({
		id: z.string().uuid(),
	}),
	body: ExpensesSchema.omit({ id: true }).partial(),
});
export type UpdateExpensesType = z.infer<typeof UpdateExpensesSchema>;

// Schema untuk params id
export const ExpenseParamsSchema = z.object({
	params: z.object({
		id: z.string().uuid(),
	}),
});
export type ExpenseParamsType = z.infer<typeof ExpenseParamsSchema>;
