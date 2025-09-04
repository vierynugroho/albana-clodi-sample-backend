import { AwsService } from "@/common/libs/awsService";
import { ServiceResponse } from "@/common/models/serviceResponse";
import { env } from "@/common/utils/envConfig";
import { prismaClient } from "@/config/prisma";
import { StatusCodes } from "http-status-codes";
import type { CreateShopSettingType, UpdateShopSettingType } from "./model";

class ShopService {
  // private readonly awsService;

  // constructor(
  // 	initAws = new AwsService({
  // 		cloudCubeAccessKey: env.CLOUDCUBE_ACCESS_KEY,
  // 		cloudCubeBucket: env.CLOUDCUBE_BUCKET,
  // 		cloudCubeRegion: env.CLOUDCUBE_REGION,
  // 		cloudCubeSecretKey: env.CLOUDCUBE_SECRET_KEY,
  // 		cloudCubeUrl: env.CLOUDCUBE_URL,
  // 	}),
  // ) {
  // 	this.awsService = initAws;
  // }

  public async createShopSetting(data: CreateShopSettingType["body"]) {
    try {
      const existingSettings = await prismaClient().shopSetting.findFirst();

      if (existingSettings) {
        return ServiceResponse.failure(
          "Pengaturan toko sudah ada",
          null,
          StatusCodes.BAD_REQUEST
        );
      }

      console.log(data.logo);

      // Upload logo dan banner ke AWS jika ada
      //   const logoUrl = data.logo
      //     ? await this.awsService.uploadFile(
      //         data.logo as unknown as Express.Multer.File
      //       )
      //     : null;
      const logoUrl =
        "https://albana-grosir.my.id/images/logo/albana-clodi-logo.svg";
      // const bannerUrl = data.banner
      // 	? await this.awsService.uploadFile(data.banner as unknown as Express.Multer.File)
      // 	: null;
      const bannerUrl =
        "https://albana-grosir.my.id/images/logo/albana-clodi-logo.svg";

      const shopSetting = await prismaClient().shopSetting.create({
        data: {
          name: data.name,
          description: data.description,
          email: data.email,
          phoneNumber: data.phoneNumber,
          address: data.address,
          owner: data.owner,
          logo: logoUrl,
          banner: bannerUrl,
        },
      });

      return ServiceResponse.success(
        "Berhasil membuat pengaturan toko",
        shopSetting,
        StatusCodes.CREATED
      );
    } catch (error) {
      return ServiceResponse.failure(
        "Terjadi kesalahan saat membuat pengaturan toko",
        null,
        StatusCodes.INTERNAL_SERVER_ERROR
      );
    }
  }

  public async getShopSetting() {
    try {
      const shopSetting = await prismaClient().shopSetting.findFirst();

      if (!shopSetting) {
        return ServiceResponse.failure(
          "Pengaturan toko belum dibuat",
          null,
          StatusCodes.NOT_FOUND
        );
      }

      return ServiceResponse.success(
        "Berhasil mendapatkan pengaturan toko",
        shopSetting,
        StatusCodes.OK
      );
    } catch (error) {
      return ServiceResponse.failure(
        "Terjadi kesalahan saat mengambil pengaturan toko",
        null,
        StatusCodes.INTERNAL_SERVER_ERROR
      );
    }
  }

  public async updateShopSetting(updateData: UpdateShopSettingType["body"]) {
    try {
      const existingSettings = await prismaClient().shopSetting.findFirst();

      if (!existingSettings) {
        return ServiceResponse.failure(
          "Pengaturan toko belum dibuat",
          null,
          StatusCodes.NOT_FOUND
        );
      }

      // Upload logo dan banner ke AWS jika ada
      //   const logoUrl = updateData.logo
      //     ? await this.awsService.uploadFile(
      //         updateData.logo as unknown as Express.Multer.File
      //       )
      //     : existingSettings.logo;
      //   const bannerUrl = updateData.banner
      //     ? await this.awsService.uploadFile(
      //         updateData.banner as unknown as Express.Multer.File
      //       )
      //     : existingSettings.banner;
      const logoUrl =
        "https://albana-grosir.my.id/images/logo/albana-clodi-logo.svg";
      const bannerUrl =
        "https://albana-grosir.my.id/images/logo/albana-clodi-logo.svg";

      // Hapus gambar lama jika ada gambar baru
      //   if (updateData.logo && existingSettings.logo) {
      //     const logoKey = this.awsService.extractKeyFromUrl(
      //       existingSettings.logo
      //     );
      //     await this.awsService.deleteFile(logoKey);
      //   }

      //   if (updateData.banner && existingSettings.banner) {
      //     const bannerKey = this.awsService.extractKeyFromUrl(
      //       existingSettings.banner
      //     );
      //     await this.awsService.deleteFile(bannerKey);
      //   }

      const updatedShopSetting = await prismaClient().shopSetting.update({
        where: { id: existingSettings.id },
        data: {
          ...updateData,
          logo: logoUrl,
          banner: bannerUrl,
        },
      });

      return ServiceResponse.success(
        "Berhasil mengupdate pengaturan toko",
        updatedShopSetting,
        StatusCodes.OK
      );
    } catch (error) {
      return ServiceResponse.failure(
        "Terjadi kesalahan saat mengupdate pengaturan toko",
        null,
        StatusCodes.INTERNAL_SERVER_ERROR
      );
    }
  }
}

export const shopService = new ShopService();
