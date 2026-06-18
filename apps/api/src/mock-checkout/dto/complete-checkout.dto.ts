import { IsString, IsNotEmpty, IsUUID } from 'class-validator';

/**
 * DTO for POST /mock-checkout/complete/:entryId
 *
 * The caller must present both the eventId and the checkoutToken that was
 * issued at admission time (delivered via WebSocket 'admitted' event and
 * stored in the frontend's queue store).
 *
 * The checkoutToken is a signed JWT containing { sessionId, eventId } whose
 * JTI was recorded in QueueEntry.checkout_token_jti at the moment the entry
 * was admitted. Verifying the token proves the caller was the exact party
 * who was admitted, without requiring a user account (shoppers are
 * intentionally unauthenticated on the HTTP layer).
 *
 * This is strictly stronger than a bare sessionId string comparison because
 * sessionIds are client-generated UUIDs — an attacker who knows or can guess
 * the sessionId could spoof a plain string match. The signed token is
 * unforgeable without the server-side JWT_ACCESS_SECRET.
 */
export class CompleteCheckoutDto {
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  eventId: string;

  @IsString()
  @IsNotEmpty()
  checkoutToken: string;
}
