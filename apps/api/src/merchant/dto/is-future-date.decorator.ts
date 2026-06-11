import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';

/**
 * @IsFutureDate() — class-validator decorator that rejects any date string
 * whose parsed value is not strictly in the future relative to the moment
 * the request is processed.
 *
 * "Future" means: new Date(value) > new Date() at validation time.
 * There is no grace buffer — any past instant is rejected with a clear message.
 *
 * Rationale for no buffer: grace windows create confusing edge cases
 * ("why does a 59-minute-old date pass but 61-minute-old one doesn't?").
 * Merchants who need to correct a past archiving error should go via ops.
 *
 * Applied to: CreateEventDto.showDate (and UpdateEventDto via PartialType
 * inheritance, where the field is optional — the check only runs when the
 * field is actually provided).
 */
export function IsFutureDate(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isFutureDate',
      target: (object as any).constructor,
      propertyName,
      options: {
        message: `${propertyName} must be a future date`,
        ...validationOptions,
      },
      validator: {
        validate(value: any, _args: ValidationArguments): boolean {
          if (typeof value !== 'string') return false;
          const parsed = new Date(value);
          if (isNaN(parsed.getTime())) return false;
          return parsed > new Date();
        },
      },
    });
  };
}
