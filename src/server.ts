import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import { pino } from "pino";

import { openAPIRouter } from "@/api-docs/openAPIRouter";
import { healthCheckRouter } from "@/api/healthCheck/healthCheckRouter";
import errorHandler from "@/common/middleware/errorHandler";
import rateLimiter from "@/common/middleware/rateLimiter";
import requestLogger from "@/common/middleware/requestLogger";
import { env } from "@/common/utils/envConfig";
import compression from "compression";
import { Roles } from "../generated/prisma";
import { authRouter } from "./api/auth/route";
import { categoryRouter } from "./api/category/categoryRouter";
import { customerRouter } from "./api/customer/customerRouter";
import { deliveryPlaceRouter } from "./api/delivery-place/router";
import { expensesRouter } from "./api/expenses/router";
import { orderRouter } from "./api/order/router";
import { paymentMethodRouter } from "./api/payment-method/paymentMethodRouter";
import { productRouter } from "./api/product/productRouter";
import { receiptRouter } from "./api/receipt/router";
import { regionRouter } from "./api/region/regionRouter";
import { reportRouter } from "./api/report/router";
import { salesChannelRouter } from "./api/sales-channel/salesChannelRouter";
import { shippingCostRouter } from "./api/shipping-cost/router";
import { shopRouter } from "./api/shop/route";
import { authenticate } from "./common/middleware/authenticate";
import { authorizeRoles } from "./common/middleware/authorizeRoles";

const logger = pino({ name: "server start" });
const app: Express = express();

// Set the application to trust the reverse proxy
app.set("trust proxy", true);

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

app.use(compression());

// app.use(helmet());
// app.use(rateLimiter);

// Request logging
app.use(requestLogger);

// Routes
app.use("/health-check", healthCheckRouter);
app.use("/auth", authRouter);
app.use("/expenses", authenticate, authorizeRoles([Roles.ADMIN, Roles.SUPERADMIN]), expensesRouter);
app.use("/products", authenticate, authorizeRoles([Roles.ADMIN, Roles.SUPERADMIN]), productRouter);
app.use("/delivery-places", authenticate, authorizeRoles([Roles.ADMIN, Roles.SUPERADMIN]), deliveryPlaceRouter);
app.use("/orders", authenticate, authorizeRoles([Roles.ADMIN, Roles.SUPERADMIN]), orderRouter);
app.use("/regions", authenticate, authorizeRoles([Roles.ADMIN, Roles.SUPERADMIN]), regionRouter);
app.use("/customers", authenticate, authorizeRoles([Roles.ADMIN, Roles.SUPERADMIN]), customerRouter);
app.use("/payment-methods", authenticate, authorizeRoles([Roles.ADMIN, Roles.SUPERADMIN]), paymentMethodRouter);
app.use("/sales-channels", authenticate, authorizeRoles([Roles.ADMIN, Roles.SUPERADMIN]), salesChannelRouter);
app.use("/shipping-cost", authenticate, authorizeRoles([Roles.ADMIN, Roles.SUPERADMIN]), shippingCostRouter);
app.use("/reports", authenticate, authorizeRoles([Roles.ADMIN, Roles.SUPERADMIN]), reportRouter);
app.use("/receipts", authenticate, authorizeRoles([Roles.ADMIN, Roles.SUPERADMIN]), receiptRouter);
app.use("/shop", authenticate, authorizeRoles([Roles.SUPERADMIN]), shopRouter);
app.use("/categories", authenticate, authorizeRoles([Roles.SUPERADMIN]), categoryRouter);

app.use("/api-docs", openAPIRouter);

// Middleware untuk menangani rute yang tidak ditemukan
app.use((req, res) => {
	res.status(404).json({
		status: "error",
		message: "Route not found",
		path: req.originalUrl,
		documentation: "/api-docs",
	});
});

// Error handlers
app.use(errorHandler());

export { app, logger };
