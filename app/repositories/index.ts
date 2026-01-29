/**
 * Repository Layer Exports
 *
 * The repository layer handles all database operations.
 * Services should import from here, NOT from ~/lib/prisma directly.
 *
 * LAYER HIERARCHY:
 * Routes → Services → Repositories → Database
 */

// Base repository utilities
export {
  type PaginationOptions,
  type PaginatedResult,
  type RepositoryResult,
  success,
  failure,
  BaseRepository,
  getPaginationParams,
  createPaginatedResult,
  notDeleted,
  userBasicSelect,
  userWithProfileSelect,
} from "./base.repository";

// Entity repositories
export {
  userRepository,
  type UserWithProfile,
  type CreateUserInput,
  type UpdateUserInput,
  type UserFilters,
} from "./user.repository";

export {
  profileRepository,
  type CreateProfileInput,
  type UpdateProfileInput,
} from "./profile.repository";

export { sessionRepository, type CreateSessionInput } from "./session.repository";

export {
  magicLinkRepository,
  type CreateMagicLinkInput,
} from "./magic-link.repository";

export {
  passwordResetRepository,
  type PasswordResetWithUser,
} from "./password-reset.repository";

export {
  organizationRepository,
  type OrganizationWithMembers,
  type CreateOrganizationInput,
  type UpdateOrganizationInput,
} from "./organization.repository";

export {
  subscriptionRepository,
  type SubscriptionWithOrg,
  type CreateSubscriptionInput,
  type UpdateSubscriptionInput,
} from "./subscription.repository";

export {
  planRepository,
  type CreatePlanInput,
  type UpdatePlanInput,
} from "./plan.repository";

export {
  paymentRepository,
  type CreatePaymentInput,
  type UpdatePaymentInput,
} from "./payment.repository";

export {
  invitationRepository,
  type CreateInvitationInput,
  type InvitationWithOrg,
} from "./invitation.repository";

export {
  dataExportRepository,
  type DataExportStatus,
  type CreateDataExportInput,
} from "./data-export.repository";

export {
  storeRepository,
  type CreateStoreInput,
  type UpdateStoreInput,
  type StoreFilters,
} from "./store.repository";

export {
  listingRepository,
  type CreateListingInput,
  type UpdateListingInput,
  type CreateSellDetailsInput,
  type CreateMediaInput,
  type ListingFilters,
} from "./listing.repository";

export {
  orderRepository,
  type CreateOrderInput,
  type CreateOrderItemInput,
  type UpdateOrderInput,
  type CreateTimelineEventInput,
  type CreateOrderMessageInput,
} from "./order.repository";

export {
  walletRepository,
  type CreateWalletInput,
  type CreateLedgerEntryInput,
  type FeeRuleFilters,
} from "./wallet.repository";
