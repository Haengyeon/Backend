import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { MatchingService } from './matching.service';
import { CreateMatchingDto } from './dto/create-matching.dto';
import { UpdateMatchingDto } from './dto/update-matching.dto';

@Controller('matching')
export class MatchingController {
  constructor(private readonly matchingService: MatchingService) {}

  @Post()
  create(@Body() createMatchingDto: CreateMatchingDto) {
    return this.matchingService.create(createMatchingDto);
  }

  @Get()
  findAll() {
    return this.matchingService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.matchingService.findOne(+id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateMatchingDto: UpdateMatchingDto,
  ) {
    return this.matchingService.update(+id, updateMatchingDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.matchingService.remove(+id);
  }
}
