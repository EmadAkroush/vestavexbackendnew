import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Package } from './schemas/packages.schema';

@Injectable()
export class PackagesService {
  constructor(
    @InjectModel(Package.name) private packageModel: Model<Package>,
  ) {}

  async createPackage(data: Partial<Package>): Promise<Package> {
    const newPack = new this.packageModel(data);
    return await newPack.save();
  }

  async getAllPackages(): Promise<Package[]> {
    return await this.packageModel.find().sort({ minDeposit: 1 }).exec();
  }

  async getPackageById(id: string): Promise<Package> {
    const pack = await this.packageModel.findById(id).exec();
    if (!pack) throw new NotFoundException('Package not found');
    return pack;
  }

  async updatePackage(id: string, data: Partial<Package>): Promise<Package> {
    const updated = await this.packageModel
      .findByIdAndUpdate(id, data, { new: true })
      .exec();
    if (!updated) throw new NotFoundException('Package not found');
    return updated;
  }

  async deletePackage(id: string): Promise<{ deleted: boolean }> {
    const res = await this.packageModel.findByIdAndDelete(id).exec();
    if (!res) throw new NotFoundException('Package not found');
    return { deleted: true };
  }
}
