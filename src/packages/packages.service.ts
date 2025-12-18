import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Package } from './schemas/packages.schema';
import { CreatePackageDto } from './dto/create-package.dto';
import { UpdatePackageDto } from './dto/update-package.dto';

@Injectable()
export class PackagesService {
  constructor(
    @InjectModel(Package.name)
    private readonly packageModel: Model<Package>,
  ) {}

  async create(dto: CreatePackageDto) {
    return this.packageModel.create(dto);
  }

  async findAll(activeOnly = true) {
    const filter = activeOnly ? { isActive: true } : {};
    return this.packageModel.find(filter).sort({ minDeposit: 1 });
  }

  async findOne(id: string) {
    const pkg = await this.packageModel.findById(id);
    if (!pkg) throw new NotFoundException('Package not found');
    return pkg;
  }

  async update(id: string, dto: UpdatePackageDto) {
    const pkg = await this.packageModel.findByIdAndUpdate(id, dto, {
      new: true,
    });
    if (!pkg) throw new NotFoundException('Package not found');
    return pkg;
  }

  async remove(id: string) {
    const pkg = await this.packageModel.findByIdAndDelete(id);
    if (!pkg) throw new NotFoundException('Package not found');
    return { message: 'Package deleted successfully' };
  }
}
