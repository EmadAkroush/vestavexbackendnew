import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { PackagesService } from './packages.service';
import { Package } from './schemas/packages.schema';

@Controller('packages')
export class PackagesController {
  constructor(private readonly packagesService: PackagesService) {}

  @Get()
  async getAll(): Promise<Package[]> {
    return this.packagesService.getAllPackages();
  }

  @Get(':id')
  async getOne(@Param('id') id: string): Promise<Package> {
    return this.packagesService.getPackageById(id);
  }

  @Post()
  async create(@Body() body: Partial<Package>): Promise<Package> {
    return this.packagesService.createPackage(body);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() body: Partial<Package>): Promise<Package> {
    return this.packagesService.updatePackage(id, body);
  }

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<{ deleted: boolean }> {
    return this.packagesService.deletePackage(id);
  }
}
