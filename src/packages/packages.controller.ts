import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { PackagesService } from './packages.service';
import { CreatePackageDto } from './dto/create-package.dto';
import { UpdatePackageDto } from './dto/update-package.dto';

@Controller('packages')
export class PackagesController {
  constructor(private readonly packagesService: PackagesService) {}

  // ➕ Create package (Admin)
  @Post('create')
  create(@Body() dto: CreatePackageDto) {
    return this.packagesService.create(dto);
  }

  // 📦 Get all packages
  @Get()
  findAll(@Query('all') all: string) {
    return this.packagesService.findAll(all !== 'true');
  }

  // 🔍 Get one package
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.packagesService.findOne(id);
  }

  // ✏️ Update package
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePackageDto,
  ) {
    return this.packagesService.update(id, dto);
  }

  // ❌ Delete package
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.packagesService.remove(id);
  }
}
