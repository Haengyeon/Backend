import { Injectable } from '@nestjs/common';
import { CreateMatchingDto } from './dto/create-matching.dto';
import { UpdateMatchingDto } from './dto/update-matching.dto';

@Injectable()
export class MatchingService {
  create(createMatchingDto: CreateMatchingDto) {
    return 'This action adds a new matching';
  }

  findAll() {
    return `This action returns all matching`;
  }

  findOne(id: number) {
    return `This action returns a #${id} matching`;
  }

  update(id: number, updateMatchingDto: UpdateMatchingDto) {
    return `This action updates a #${id} matching`;
  }

  remove(id: number) {
    return `This action removes a #${id} matching`;
  }
}
