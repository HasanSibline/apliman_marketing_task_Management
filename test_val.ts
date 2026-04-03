import { Validator } from 'class-validator';
import { Type, plainToInstance } from 'class-transformer';
import { IsOptional, IsArray, Allow } from 'class-validator';
import { validate } from 'class-validator';

class SendMessageDto {
  @IsOptional()
  @IsArray()
  @Allow()
  files?: any[];
}

async function run() {
  const payload = {
    message: "hello",
    files: [{ name: "test.pdf", url: "http://example.com" }]
  };

  const dto = plainToInstance(SendMessageDto, payload);
  await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  console.log("Result:", JSON.stringify(dto));
}

run();
