
import { pgTable, uuid, text, boolean, integer, numeric, timestamp, jsonb, doublePrecision, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enums for RBAC
export const tenantRoleEnum = pgEnum('tenant_role', ['owner', 'admin', 'manager', 'member', 'viewer']);

// Enums for advanced RBAC
export const rbacEntityTypeEnum = pgEnum('rbac_entity_type', ['role', 'permission', 'member_role', 'member_permission']);

// Enums for outbox and saga
export const outboxEventStatusEnum = pgEnum('outbox_event_status', ['pending', 'processing', 'published', 'failed']);
export const sagaStatusEnum = pgEnum('saga_status', ['started', 'step_completed', 'compensating', 'completed', 'failed']);

// Enums for service authentication
export const serviceStatusEnum = pgEnum('service_status', ['active', 'suspended', 'revoked']);
export const certificateStatusEnum = pgEnum('certificate_status', ['active', 'rotating', 'revoked', 'expired']);

// Tenants Table - Multi-tenancy support
export const tenants = pgTable('tenants', {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(), // URL-friendly identifier
    description: text('description'),
    logo: text('logo'),
    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'restrict' }).notNull(),
    status: text('status').default('active'), // active, suspended, deleted
    tier: text('tier').default('free'), // free, pro, enterprise
    maxMembers: integer('max_members').default(5),
    maxProjects: integer('max_projects').default(3),
    features: jsonb('features').default({
        ai: false,
        customReports: false,
        teamCollaboration: false,
        advancedAnalytics: false
    }),
    settings: jsonb('settings').default({
        currency: 'USD',
        timezone: 'UTC',
        language: 'en',
        theme: 'auto'
    }),
    metadata: jsonb('metadata').default({
        createdBy: 'system',
        lastModified: null,
        joinCode: null
    }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Tenant Members Table - Manage team members and roles
export const tenantMembers = pgTable('tenant_members', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    role: tenantRoleEnum('role').default('member'),
    permissions: jsonb('permissions').default([]), // Custom permissions override
    status: text('status').default('active'), // active, pending, invited, deleted
    inviteToken: text('invite_token'), // For pending invites
    inviteExpiresAt: timestamp('invite_expires_at'),
    joinedAt: timestamp('joined_at').defaultNow(),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// RBAC Roles Table - Hierarchical role definitions per tenant
export const rbacRoles = pgTable('rbac_roles', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    parentRoleId: uuid('parent_role_id'),
    isSystem: boolean('is_system').default(false),
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// RBAC Permissions Table - Permission definitions per tenant
export const rbacPermissions = pgTable('rbac_permissions', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    key: text('key').notNull(),
    description: text('description'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// RBAC Role Permissions - Role to permission mapping
export const rbacRolePermissions = pgTable('rbac_role_permissions', {
    id: uuid('id').defaultRandom().primaryKey(),
    roleId: uuid('role_id').references(() => rbacRoles.id, { onDelete: 'cascade' }).notNull(),
    permissionId: uuid('permission_id').references(() => rbacPermissions.id, { onDelete: 'cascade' }).notNull(),
    createdAt: timestamp('created_at').defaultNow(),
});

// Member Role Assignments - Assign one or more RBAC roles to tenant members
export const tenantMemberRoles = pgTable('tenant_member_roles', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantMemberId: uuid('tenant_member_id').references(() => tenantMembers.id, { onDelete: 'cascade' }).notNull(),
    roleId: uuid('role_id').references(() => rbacRoles.id, { onDelete: 'cascade' }).notNull(),
    createdAt: timestamp('created_at').defaultNow(),
});

// RBAC Audit Log - Track all changes to RBAC entities
export const rbacAuditLogs = pgTable('rbac_audit_logs', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    entityType: rbacEntityTypeEnum('entity_type').notNull(),
    entityId: uuid('entity_id'),
    changes: jsonb('changes').default({}),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
});

// Centralized Audit Logs - Tamper-evident activity logging for compliance and security
export const auditLogs = pgTable('audit_logs', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'set null' }),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    category: text('category').default('general'),
    resourceType: text('resource_type'),
    resourceId: text('resource_id'),
    method: text('method'),
    path: text('path'),
    statusCode: integer('status_code'),
    outcome: text('outcome').default('success'),
    severity: text('severity').default('low'),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    requestId: text('request_id'),
    metadata: jsonb('metadata').default({}),
    changes: jsonb('changes').default({}),
    previousHash: text('previous_hash'),
    entryHash: text('entry_hash').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
});

// Users Table
export const users = pgTable('users', {
    id: uuid('id').defaultRandom().primaryKey(),
    email: text('email').notNull().unique(),
    password: text('password').notNull(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    profilePicture: text('profile_picture').default(''),
    dateOfBirth: timestamp('date_of_birth'),
    phoneNumber: text('phone_number'),
    currency: text('currency').default('USD'),
    monthlyIncome: numeric('monthly_income', { precision: 12, scale: 2 }).default('0'),
    monthlyBudget: numeric('monthly_budget', { precision: 12, scale: 2 }).default('0'),
    emergencyFund: numeric('emergency_fund', { precision: 12, scale: 2 }).default('0'),
    isActive: boolean('is_active').default(true),
    lastLogin: timestamp('last_login').defaultNow(),
    mfaEnabled: boolean('mfa_enabled').default(false),
    mfaSecret: text('mfa_secret'),
    preferences: jsonb('preferences').default({
        notifications: { email: true, push: true, sms: false },
        theme: 'auto',
        language: 'en'
    }),
    savingsRoundUpEnabled: boolean('savings_round_up_enabled').default(false),
    savingsGoalId: uuid('savings_goal_id'), // Linked to goals.id later in relations
    roundUpToNearest: numeric('round_up_to_nearest', { precision: 5, scale: 2 }).default('1.00'),
    peerComparisonConsent: boolean('peer_comparison_consent').default(false),
    ageGroup: text('age_group'),
    incomeRange: text('income_range'),
    location: text('location'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const categories = pgTable('categories', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    name: text('name').notNull(),
    description: text('description'),
    color: text('color').notNull().default('#3B82F6'),
    icon: text('icon').default('tag'),
    type: text('type').default('expense'),
    isDefault: boolean('is_default').default(false),
    isActive: boolean('is_active').default(true),
    parentCategoryId: uuid('parent_category_id').references(() => categories.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    budget: jsonb('budget').default({ monthly: 0, yearly: 0 }),
    spendingLimit: numeric('spending_limit', { precision: 12, scale: 2 }).default('0'),
    priority: integer('priority').default(0),
    metadata: jsonb('metadata').default({ usageCount: 0, lastUsed: null, averageAmount: 0 }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Budget Alerts Table
export const budgetAlerts = pgTable('budget_alerts', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'cascade' }),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }),
    threshold: integer('threshold').notNull(), // 50, 80, 100
    period: text('period').notNull(), // '2023-10'
    triggeredAt: timestamp('triggered_at').defaultNow(),
    metadata: jsonb('metadata').default({}),
});

export const budgetRules = pgTable('budget_rules', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'cascade' }).notNull(),
    name: text('name').notNull(),
    description: text('description'),
    ruleType: text('rule_type').notNull(), // 'percentage', 'amount', 'frequency'
    condition: jsonb('condition').notNull(), // { operator: '>', value: 500, period: 'week' }
    threshold: numeric('threshold', { precision: 12, scale: 2 }).notNull(),
    period: text('period').notNull(), // 'daily', 'weekly', 'monthly', 'yearly'
    notificationType: text('notification_type').notNull(), // 'email', 'push', 'in_app'
    isActive: boolean('is_active').default(true),
    lastTriggered: timestamp('last_triggered'),
    metadata: jsonb('metadata').default({
        triggerCount: 0,
        lastAmount: 0,
        createdBy: 'user'
    }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const expenses = pgTable('expenses', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    vaultId: uuid('vault_id'), // References vaults.id later
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    currency: text('currency').default('USD'),
    description: text('description').notNull(),
    date: timestamp('date').defaultNow().notNull(),
    paymentMethod: text('payment_method').default('other'),
    location: jsonb('location'),
    tags: jsonb('tags').default([]),
    receipt: jsonb('receipt'),
    isRecurring: boolean('is_recurring').default(false),
    recurringPattern: jsonb('recurring_pattern'),
    nextExecutionDate: timestamp('next_execution_date'),
    lastExecutedDate: timestamp('last_executed_date'),
    notes: text('notes'),
    status: text('status').default('completed'),
    isTaxDeductible: boolean('is_tax_deductible').default(false),
    taxCategoryId: uuid('tax_category_id'),
    taxYear: integer('tax_year'),
    metadata: jsonb('metadata').default({ createdBy: 'system', version: 1 }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    userDateIdx: index('idx_expenses_user_date').on(table.userId, table.date),
    userCategoryIdx: index('idx_expenses_user_category').on(table.userId, table.categoryId),
}));

export const expenseShares = pgTable('expense_shares', {
    id: uuid('id').defaultRandom().primaryKey(),
    expenseId: uuid('expense_id').references(() => expenses.id, { onDelete: 'cascade' }).notNull(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    shareAmount: numeric('share_amount', { precision: 12, scale: 2 }).notNull(),
    sharePercentage: doublePrecision('share_percentage'),
    isPaid: boolean('is_paid').default(false),
    paidAt: timestamp('paid_at'),
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const reimbursements = pgTable('reimbursements', {
    id: uuid('id').defaultRandom().primaryKey(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }).notNull(),
    fromUserId: uuid('from_user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    toUserId: uuid('to_user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    currency: text('currency').default('USD'),
    description: text('description').notNull(),
    status: text('status').default('pending'),
    expenseId: uuid('expense_id').references(() => expenses.id, { onDelete: 'set null' }),
    completedAt: timestamp('completed_at'),
    dueDate: timestamp('due_date'),
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const expenseApprovals = pgTable('expense_approvals', {
    id: uuid('id').defaultRandom().primaryKey(),
    expenseId: uuid('expense_id').references(() => expenses.id, { onDelete: 'cascade' }).notNull(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }).notNull(),
    requestedBy: uuid('requested_by').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    approvedBy: uuid('approved_by').references(() => users.id, { onDelete: 'set null' }),
    status: text('status').default('pending'),
    approvalNotes: text('approval_notes'),
    requestedAt: timestamp('requested_at').defaultNow(),
    approvedAt: timestamp('approved_at'),
    metadata: jsonb('metadata').default({
        budgetId: null,
        amount: 0,
        category: null
    }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const sharedBudgets = pgTable('shared_budgets', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    totalBudget: numeric('total_budget', { precision: 12, scale: 2 }).notNull(),
    currentSpent: numeric('current_spent', { precision: 12, scale: 2 }).default('0'),
    currency: text('currency').default('USD'),
    period: text('period').default('monthly'),
    startDate: timestamp('start_date').defaultNow(),
    endDate: timestamp('end_date'),
    approvalRequired: boolean('approval_required').default(false),
    approvalThreshold: numeric('approval_threshold', { precision: 12, scale: 2 }),
    isActive: boolean('is_active').default(true),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    metadata: jsonb('metadata').default({
        categories: [],
        contributors: [],
        approvers: []
    }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Vaults Module
export const vaults = pgTable('vaults', {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    description: text('description'),
    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    currency: text('currency').default('USD'),
    isActive: boolean('is_active').default(true),
    status: text('status').default('active'), // 'active', 'frozen'
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Subscriptions Table  
export const subscriptions = pgTable('subscriptions', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    currency: text('currency').default('USD'),
    billingCycle: text('billing_cycle').default('monthly'), // monthly, yearly, weekly
    nextPaymentDate: timestamp('next_payment_date').notNull(),
    description: text('description'),
    isActive: boolean('is_active').default(true),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const subscriptionUsage = pgTable('subscription_usage', {
    id: uuid('id').defaultRandom().primaryKey(),
    subscriptionId: uuid('subscription_id').references(() => subscriptions.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    month: text('month').notNull(), // Format: YYYY-MM
    usageCount: integer('usage_count').default(0),
    usageMinutes: integer('usage_minutes').default(0),
    usageValue: jsonb('usage_value').default({}), // Flexible for different tracking metrics
    lastUsed: timestamp('last_used'),
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Outbox Events Table - Transactional outbox pattern for reliable event publishing
export const outboxEvents = pgTable('outbox_events', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    aggregateType: text('aggregate_type').notNull(), // tenant, user, expense, goal, etc.
    aggregateId: uuid('aggregate_id').notNull(),
    eventType: text('event_type').notNull(), // tenant.created, user.invited, expense.created, etc.
    payload: jsonb('payload').notNull().default({}),
    metadata: jsonb('metadata').default({}),
    status: outboxEventStatusEnum('status').default('pending'),
    retryCount: integer('retry_count').default(0),
    maxRetries: integer('max_retries').default(3),
    lastError: text('last_error'),
    processedAt: timestamp('processed_at'),
    publishedAt: timestamp('published_at'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Saga Instances Table - Track long-running distributed transactions
export const sagaInstances = pgTable('saga_instances', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    sagaType: text('saga_type').notNull(), // tenant_onboarding, member_invitation, billing_payment, etc.
    correlationId: uuid('correlation_id').notNull().unique(),
    status: sagaStatusEnum('status').default('started'),
    currentStep: text('current_step'),
    stepIndex: integer('step_index').default(0),
    totalSteps: integer('total_steps').notNull(),
    payload: jsonb('payload').notNull().default({}),
    stepResults: jsonb('step_results').default([]),
    compensationData: jsonb('compensation_data').default({}),
    error: text('error'),
    startedAt: timestamp('started_at').defaultNow(),
    completedAt: timestamp('completed_at'),
    failedAt: timestamp('failed_at'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Saga Step Executions Table - Track individual step execution history
export const sagaStepExecutions = pgTable('saga_step_executions', {
    id: uuid('id').defaultRandom().primaryKey(),
    sagaInstanceId: uuid('saga_instance_id').references(() => sagaInstances.id, { onDelete: 'cascade' }).notNull(),
    stepName: text('step_name').notNull(),
    stepIndex: integer('step_index').notNull(),
    status: text('status').notNull(), // started, completed, failed, compensating, compensated
    input: jsonb('input').default({}),
    output: jsonb('output').default({}),
    error: text('error'),
    compensated: boolean('compensated').default(false),
    retryCount: integer('retry_count').default(0),
    startedAt: timestamp('started_at').defaultNow(),
    completedAt: timestamp('completed_at'),
    compensatedAt: timestamp('compensated_at'),
    createdAt: timestamp('created_at').defaultNow(),
});

// Service Identities Table - Machine identities for internal services
export const serviceIdentities = pgTable('service_identities', {
    id: uuid('id').defaultRandom().primaryKey(),
    serviceName: text('service_name').notNull().unique(),
    displayName: text('display_name').notNull(),
    description: text('description'),
    serviceType: text('service_type').notNull(), // api, worker, scheduler, external
    status: serviceStatusEnum('status').default('active'),
    allowedScopes: jsonb('allowed_scopes').default([]).notNull(), // e.g., ['read:tenant', 'write:audit']
    metadata: jsonb('metadata').default({}),
    lastAuthAt: timestamp('last_auth_at'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Service Certificates Table - mTLS certificates for services
export const serviceCertificates = pgTable('service_certificates', {
    id: uuid('id').defaultRandom().primaryKey(),
    serviceId: uuid('service_id').references(() => serviceIdentities.id, { onDelete: 'cascade' }).notNull(),
    certificateId: text('certificate_id').notNull().unique(), // Unique identifier for the cert
    serialNumber: text('serial_number').notNull().unique(),
    fingerprint: text('fingerprint').notNull().unique(), // SHA-256 fingerprint
    publicKey: text('public_key').notNull(), // PEM format
    privateKey: text('private_key'), // Encrypted PEM format (only stored if managed internally)
    issuer: text('issuer').notNull(),
    subject: text('subject').notNull(),
    status: certificateStatusEnum('status').default('active'),
    notBefore: timestamp('not_before').notNull(),
    notAfter: timestamp('not_after').notNull(),
    rotationScheduledAt: timestamp('rotation_scheduled_at'),
    revokedAt: timestamp('revoked_at'),
    revokedReason: text('revoked_reason'),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Service Auth Logs Table - Audit trail for service authentication attempts
export const serviceAuthLogs = pgTable('service_auth_logs', {
    id: uuid('id').defaultRandom().primaryKey(),
    serviceId: uuid('service_id').references(() => serviceIdentities.id, { onDelete: 'set null' }),
    serviceName: text('service_name').notNull(),
    certificateId: text('certificate_id'),
    authMethod: text('auth_method').notNull(), // mtls, jwt, mtls+jwt
    outcome: text('outcome').notNull(), // success, failure
    failureReason: text('failure_reason'),
    requestedScopes: jsonb('requested_scopes').default([]),
    grantedScopes: jsonb('granted_scopes').default([]),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    requestId: text('request_id'),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
    ownedTenants: many(tenants),
    tenantMembers: many(tenantMembers),
    categories: many(categories),
    expenses: many(expenses),
    goals: many(goals),
    deviceSessions: many(deviceSessions),
    rbacAuditLogs: many(rbacAuditLogs),
    auditLogs: many(auditLogs),
}));

export const tenantsRelations = relations(tenants, ({ one, many }) => ({
    owner: one(users, {
        fields: [tenants.ownerId],
        references: [users.id],
    }),
    members: many(tenantMembers),
    categories: many(categories),
    expenses: many(expenses),
    goals: many(goals),
    rbacRoles: many(rbacRoles),
    rbacPermissions: many(rbacPermissions),
    rbacAuditLogs: many(rbacAuditLogs),
    auditLogs: many(auditLogs),
}));

export const tenantMembersRelations = relations(tenantMembers, ({ one, many }) => ({
    tenant: one(tenants, {
        fields: [tenantMembers.tenantId],
        references: [tenants.id],
    }),
    user: one(users, {
        fields: [tenantMembers.userId],
        references: [users.id],
    }),
    memberRoles: many(tenantMemberRoles),
}));

export const rbacRolesRelations = relations(rbacRoles, ({ one, many }) => ({
    tenant: one(tenants, {
        fields: [rbacRoles.tenantId],
        references: [tenants.id],
    }),
    parentRole: one(rbacRoles, {
        fields: [rbacRoles.parentRoleId],
        references: [rbacRoles.id],
        relationName: 'rbac_role_hierarchy'
    }),
    childRoles: many(rbacRoles, {
        relationName: 'rbac_role_hierarchy'
    }),
    rolePermissions: many(rbacRolePermissions),
    memberRoles: many(tenantMemberRoles),
}));

export const rbacPermissionsRelations = relations(rbacPermissions, ({ one, many }) => ({
    tenant: one(tenants, {
        fields: [rbacPermissions.tenantId],
        references: [tenants.id],
    }),
    rolePermissions: many(rbacRolePermissions),
}));

export const rbacRolePermissionsRelations = relations(rbacRolePermissions, ({ one }) => ({
    role: one(rbacRoles, {
        fields: [rbacRolePermissions.roleId],
        references: [rbacRoles.id],
    }),
    permission: one(rbacPermissions, {
        fields: [rbacRolePermissions.permissionId],
        references: [rbacPermissions.id],
    }),
}));

export const tenantMemberRolesRelations = relations(tenantMemberRoles, ({ one }) => ({
    tenantMember: one(tenantMembers, {
        fields: [tenantMemberRoles.tenantMemberId],
        references: [tenantMembers.id],
    }),
    role: one(rbacRoles, {
        fields: [tenantMemberRoles.roleId],
        references: [rbacRoles.id],
    }),
}));

export const rbacAuditLogsRelations = relations(rbacAuditLogs, ({ one }) => ({
    tenant: one(tenants, {
        fields: [rbacAuditLogs.tenantId],
        references: [tenants.id],
    }),
    actor: one(users, {
        fields: [rbacAuditLogs.actorUserId],
        references: [users.id],
    }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
    tenant: one(tenants, {
        fields: [auditLogs.tenantId],
        references: [tenants.id],
    }),
    actor: one(users, {
        fields: [auditLogs.actorUserId],
        references: [users.id],
    }),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
    tenant: one(tenants, {
        fields: [categories.tenantId],
        references: [tenants.id],
    }),
    user: one(users, {
        fields: [categories.userId],
        references: [users.id],
    }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const financialHealthScores = pgTable('financial_health_scores', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    overallScore: doublePrecision('overall_score').notNull(),
    rating: text('rating').notNull(),
    dtiScore: doublePrecision('dti_score').default(0),
    savingsRateScore: doublePrecision('savings_rate_score').default(0),
    volatilityScore: doublePrecision('volatility_score').default(0),
    emergencyFundScore: doublePrecision('emergency_fund_score').default(0),
    budgetAdherenceScore: doublePrecision('budget_adherence_score').default(0),
    goalProgressScore: doublePrecision('goal_progress_score').default(0),
    metrics: jsonb('metrics').default({
        dti: 0,
        savingsRate: 0,
        volatility: 0,
        monthlyIncome: 0,
        monthlyExpenses: 0,
        emergencyFundMonths: 0,
        budgetAdherence: 0,
        goalProgress: 0
    }),
    recommendation: text('recommendation'),
    insights: jsonb('insights').default([]),
    cashFlowPrediction: jsonb('cash_flow_prediction').default({
        predictedExpenses: 0,
        predictedIncome: 0,
        predictedBalance: 0,
        confidence: 'low',
        warning: null
    }),
    periodStart: timestamp('period_start').notNull(),
    periodEnd: timestamp('period_end').notNull(),
    calculatedAt: timestamp('calculated_at').defaultNow(),
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => {
    return {
        userIdIdx: index('idx_financial_health_scores_user_id').on(table.userId),
        calculatedAtIdx: index('idx_financial_health_scores_calculated_at').on(table.calculatedAt),
        ratingIdx: index('idx_financial_health_scores_rating').on(table.rating),
    };
});

// ============================================================================
// INVESTMENTS & ASSETS
// ============================================================================

export const portfolios = pgTable('portfolios', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    name: text('name').notNull(),
    totalValue: numeric('total_value', { precision: 15, scale: 2 }).default('0'),
    riskTolerance: text('risk_tolerance').default('moderate'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const investments = pgTable('investments', {
    id: uuid('id').defaultRandom().primaryKey(),
    portfolioId: uuid('portfolio_id').references(() => portfolios.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }),
    symbol: text('symbol').notNull(),
    name: text('name').notNull(),
    type: text('type').notNull(), // stock, crypto, etf, mutual_fund
    quantity: numeric('quantity', { precision: 18, scale: 8 }).notNull(),
    averageCost: numeric('average_cost', { precision: 18, scale: 8 }).notNull(),
    totalCost: numeric('total_cost', { precision: 18, scale: 2 }).notNull(),
    currentPrice: numeric('current_price', { precision: 18, scale: 8 }),
    marketValue: numeric('market_value', { precision: 18, scale: 2 }),
    unrealizedGainLoss: numeric('unrealized_gain_loss', { precision: 18, scale: 2 }),
    unrealizedGainLossPercent: numeric('unrealized_gain_loss_percent', { precision: 10, scale: 2 }),
    baseCurrencyValue: numeric('base_currency_value', { precision: 18, scale: 2 }),
    baseCurrencyCode: text('base_currency_code'),
    valuationDate: timestamp('valuation_date'),
    lastPriceUpdate: timestamp('last_price_update'),
    isActive: boolean('is_active').default(true),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    userIdx: index('idx_investments_user').on(table.userId),
    portfolioIdx: index('idx_investments_portfolio').on(table.portfolioId),
    symbolIdx: index('idx_investments_symbol').on(table.symbol),
}));

export const expensesRelations = relations(expenses, ({ one }) => ({
    tenant: one(tenants, {
        fields: [expenses.tenantId],
        references: [tenants.id],
    }),
    user: one(users, {
        fields: [expenses.userId],
        references: [users.id],
    }),
    category: one(categories, {
        fields: [expenses.categoryId],
        references: [categories.id],
    }),
}));

export const goalsRelations = relations(goals, ({ one }) => ({
    tenant: one(tenants, {
        fields: [goals.tenantId],
        references: [tenants.id],
    }),
    user: one(users, {
        fields: [goals.userId],
        references: [users.id],
    }),
    category: one(categories, {
        fields: [goals.categoryId],
        references: [goals.id],
    }),
}));

export const forecastSnapshots = pgTable('forecast_snapshots', {
    id: uuid('id').defaultRandom().primaryKey(),
    portfolioId: uuid('portfolio_id').references(() => portfolios.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    symbol: text('symbol').notNull(),
    name: text('name').notNull(),
    quantity: numeric('quantity', { precision: 15, scale: 6 }).notNull(),
    averageCost: numeric('average_cost', { precision: 12, scale: 4 }).notNull(),
    currentPrice: numeric('current_price', { precision: 12, scale: 4 }),
    createdAt: timestamp('created_at').defaultNow(),
});

export const forecasts = pgTable('forecasts', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    forecastType: text('forecast_type').notNull(), // 'expense', 'income', 'budget', 'cash_flow'
    period: text('period').notNull(), // 'monthly', 'quarterly', 'yearly'
    forecastData: jsonb('forecast_data').notNull(), // Array of prediction points with dates and values
    parameters: jsonb('parameters').notNull(), // Model parameters, confidence intervals, etc.
    accuracy: doublePrecision('accuracy'), // Model accuracy score (0-1)
    confidenceLevel: doublePrecision('confidence_level').default(0.95), // Statistical confidence level
    scenario: text('scenario').default('baseline'), // 'baseline', 'optimistic', 'pessimistic', 'custom'
    isSimulation: boolean('is_simulation').default(false), // True for user-created what-if scenarios
    simulationInputs: jsonb('simulation_inputs'), // User inputs for simulations (e.g., income changes, expense adjustments)
    currency: text('currency').default('USD'),
    metadata: jsonb('metadata').default({
        modelType: 'linear_regression',
        trainingDataPoints: 0,
        seasonalAdjustment: false,
        externalFactors: [],
        lastTrained: null
    }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const cashFlowModels = pgTable('cash_flow_models', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    modelName: text('model_name').notNull(),
    modelType: text('model_type').notNull(), // 'linear', 'exponential', 'arima', 'neural'
    timeframe: text('timeframe').notNull(), // 'daily', 'weekly', 'monthly', 'quarterly', 'yearly'
    trainingData: jsonb('training_data').notNull(), // Historical cash flow data used for training
    predictions: jsonb('predictions').notNull(), // Future cash flow predictions with dates and amounts
    accuracy: doublePrecision('accuracy'), // Model accuracy score (0-1)
    parameters: jsonb('parameters'), // Model-specific parameters (coefficients, hyperparameters, etc.)
    validFrom: timestamp('valid_from').notNull(),
    validUntil: timestamp('valid_until'),
    isActive: boolean('is_active').default(true),
    metadata: jsonb('metadata').default({
        features: [],
        confidenceIntervals: {},
        seasonalFactors: {}
    }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const currencyWallets = pgTable('currency_wallets', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }),
    currency: text('currency').notNull(), // 'USD', 'EUR', 'BTC'
    balance: numeric('balance', { precision: 18, scale: 8 }).default('0'), // High precision for crypto
    isDefault: boolean('is_default').default(false),
    updatedAt: timestamp('updated_at').defaultNow(),
    createdAt: timestamp('created_at').defaultNow(),
});

export const fxRates = pgTable('fx_rates', {
    id: uuid('id').defaultRandom().primaryKey(),
    pair: text('pair').notNull().unique(), // 'USD/EUR'
    rate: numeric('rate', { precision: 18, scale: 8 }).notNull(),
    change24h: numeric('change_24h', { precision: 5, scale: 2 }).default('0'),
    volatility: numeric('volatility', { precision: 5, scale: 2 }).default('0'), // High volatility alert
    lastUpdated: timestamp('last_updated').defaultNow(),
});

export const savingsRoundups = pgTable('savings_roundups', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    goalId: uuid('goal_id').references(() => goals.id, { onDelete: 'set null' }),
    expenseId: uuid('expense_id').references(() => expenses.id, { onDelete: 'cascade' }).notNull(),
    originalAmount: numeric('original_amount', { precision: 12, scale: 2 }).notNull(),
    roundedAmount: numeric('rounded_amount', { precision: 12, scale: 2 }).notNull(),
    roundUpAmount: numeric('round_up_amount', { precision: 12, scale: 2 }).notNull(),
    currency: text('currency').default('USD'),
    status: text('status').default('pending'), // pending, transferred, failed
    transferId: text('transfer_id'), // Plaid transfer ID
    transferDate: timestamp('transfer_date'),
    errorMessage: text('error_message'),
    metadata: jsonb('metadata').default({
        roundUpToNearest: '1.00',
        createdBy: 'system'
    }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const balanceSnapshots = pgTable('balance_snapshots', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    date: timestamp('date').defaultNow().notNull(),
    balance: numeric('balance', { precision: 12, scale: 2 }).notNull(),
    income: numeric('income', { precision: 12, scale: 2 }).default('0'),
    expense: numeric('expense', { precision: 12, scale: 2 }).default('0'),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => {
    return {
        userDateIdx: index('idx_balance_snapshots_user_date').on(table.userId, table.date),
    };
});

export const liquidityAlerts = pgTable('liquidity_alerts', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    threshold: numeric('threshold', { precision: 12, scale: 2 }).notNull(),
    alertDays: integer('alert_days').default(7),
    isActive: boolean('is_active').default(true),
    lastTriggeredAt: timestamp('last_triggered_at'),
    severity: text('severity').default('warning'), // 'warning', 'critical'
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => {
    return {
        userIdIdx: index('idx_liquidity_alerts_user_id').on(table.userId),
    };
});

export const transferSuggestions = pgTable('transfer_suggestions', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    sourceVaultId: uuid('source_vault_id').references(() => vaults.id, { onDelete: 'set null' }),
    destVaultId: uuid('dest_vault_id').references(() => vaults.id, { onDelete: 'set null' }),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    reason: text('reason'),
    suggestedDate: timestamp('suggested_date'),
    status: text('status').default('pending'), // 'pending', 'accepted', 'ignored', 'executed'
    aiConfidence: doublePrecision('ai_confidence'),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => {
    return {
        userIdIdx: index('idx_transfer_suggestions_user_id').on(table.userId),
    };
});

export const tokenBlacklist = pgTable('token_blacklist', {
    id: uuid('id').defaultRandom().primaryKey(),
    token: text('token').notNull().unique(),
    tokenType: text('token_type').notNull(), // access, refresh
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    reason: text('reason').default('logout'), // logout, password_change, security
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
});

export const reports = pgTable('reports', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    type: text('type').notNull(), // 'monthly_digest', 'tax_summary', 'custom'
    format: text('format').notNull(), // 'pdf', 'excel'
    url: text('url').notNull(),
    period: text('period'), // '2023-10'
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
});

export const vaultInvites = pgTable('vault_invites', {
    id: uuid('id').defaultRandom().primaryKey(),
    vaultId: uuid('vault_id').references(() => vaults.id, { onDelete: 'cascade' }).notNull(),
    inviterId: uuid('inviter_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    email: text('email').notNull(),
    token: text('token').notNull().unique(),
    role: text('role').default('member'),
    status: text('status').default('pending'), // pending, accepted, rejected, expired
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
});

export const fixedAssets = pgTable('fixed_assets', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    name: text('name').notNull(),
    category: text('category').notNull(),
    purchasePrice: numeric('purchase_price', { precision: 12, scale: 2 }).notNull(),
    currentValue: numeric('current_value', { precision: 12, scale: 2 }).notNull(),
    baseCurrencyValue: numeric('base_currency_value', { precision: 12, scale: 2 }),
    baseCurrencyCode: text('base_currency_code'),
    valuationDate: timestamp('valuation_date'),
    appreciationRate: numeric('appreciation_rate', { precision: 5, scale: 2 }),
    createdAt: timestamp('created_at').defaultNow(),
});

export const assetValuations = pgTable('asset_valuations', {
    id: uuid('id').defaultRandom().primaryKey(),
    assetId: uuid('asset_id').references(() => fixedAssets.id, { onDelete: 'cascade' }).notNull(),
    value: numeric('value', { precision: 12, scale: 2 }).notNull(),
    date: timestamp('date').defaultNow(),
    source: text('source').default('manual'), // 'manual', 'market_adjustment', 'appraisal'
});

export const riskProfiles = pgTable('risk_profiles', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).unique().notNull(),
    riskTolerance: text('risk_tolerance').notNull(), // 'low', 'medium', 'high', 'aggressive'
    targetReturn: numeric('target_return', { precision: 5, scale: 2 }),
    maxDrawdown: numeric('max_drawdown', { precision: 5, scale: 2 }),
    preferredAssetMix: jsonb('preferred_asset_mix'), // { stocks: 60, bonds: 30, crypto: 10 }
    updatedAt: timestamp('updated_at').defaultNow(),
    createdAt: timestamp('created_at').defaultNow(),
});

export const marketIndices = pgTable('market_indices', {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull().unique(), // 'S&P500', 'Gold', 'RealEstate_US'
    currentValue: numeric('current_value', { precision: 12, scale: 2 }),
    avgAnnualReturn: numeric('avg_annual_return', { precision: 5, scale: 2 }),
    volatility: numeric('volatility', { precision: 5, scale: 2 }),
    lastUpdated: timestamp('last_updated').defaultNow(),
});

export const arbitrageOpportunities = pgTable('arbitrage_opportunities', {
    id: uuid('id').defaultRandom().primaryKey(),
    pair: text('pair').notNull(),
    type: text('type').notNull(), // 'buy_signal', 'sell_signal'
    currentRate: numeric('current_rate', { precision: 18, scale: 8 }),
    predictedRate: numeric('predicted_rate', { precision: 18, scale: 8 }),
    confidence: numeric('confidence', { precision: 5, scale: 2 }), // 0-100
    expectedProfit: numeric('expected_profit', { precision: 5, scale: 2 }), // Percentage
    validUntil: timestamp('valid_until'),
    status: text('status').default('active'), // 'active', 'expired', 'executed'
    createdAt: timestamp('created_at').defaultNow(),
});

export const priceHistory = pgTable('price_history', {
    id: uuid('id').defaultRandom().primaryKey(),
    investmentId: uuid('investment_id').references(() => investments.id, { onDelete: 'cascade' }).notNull(),
    symbol: text('symbol').notNull(),
    date: timestamp('date').notNull(),
    open: numeric('open', { precision: 12, scale: 4 }),
    high: numeric('high', { precision: 12, scale: 4 }),
    low: numeric('low', { precision: 12, scale: 4 }),
    close: numeric('close', { precision: 12, scale: 4 }).notNull(),
    volume: integer('volume'),
    adjustedClose: numeric('adjusted_close', { precision: 12, scale: 4 }),
    dividend: numeric('dividend', { precision: 10, scale: 4 }).default('0'),
    splitRatio: doublePrecision('split_ratio').default(1),
    currency: text('currency').default('USD'),
    createdAt: timestamp('created_at').defaultNow(),
});

// ============================================================================
// BLACK SWAN LIQUIDITY STRESS-TESTER (#272)
// ============================================================================

// Stress Test Scenarios - Simulates crisis events
export const stressScenarios = pgTable('stress_scenarios', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    name: text('name').notNull(),
    scenarioType: text('scenario_type').notNull(), // job_loss, market_crash, medical_emergency, recession
    severity: text('severity').default('moderate'), // mild, moderate, severe, catastrophic
    parameters: jsonb('parameters').notNull(), // { incomeReduction: 100%, marketDrop: 40%, duration: 6 }
    status: text('status').default('pending'), // pending, running, completed, failed
    createdAt: timestamp('created_at').defaultNow(),
    completedAt: timestamp('completed_at'),
});

// Runway Calculations - Cash flow runway projections
export const runwayCalculations = pgTable('runway_calculations', {
    id: uuid('id').defaultRandom().primaryKey(),
    scenarioId: uuid('scenario_id').references(() => stressScenarios.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    currentBalance: numeric('current_balance', { precision: 15, scale: 2 }).notNull(),
    monthlyBurnRate: numeric('monthly_burn_rate', { precision: 12, scale: 2 }).notNull(),
    runwayDays: integer('runway_days').notNull(), // Days until cash runs out
    zeroBalanceDate: timestamp('zero_balance_date'), // Exact date of depletion
    criticalThresholdDate: timestamp('critical_threshold_date'), // Date when balance hits 20%
    dailyProjections: jsonb('daily_projections').notNull(), // [{ date, balance, income, expenses }]
    recommendations: jsonb('recommendations').default([]), // AI-generated survival strategies
    createdAt: timestamp('created_at').defaultNow(),
});

// Liquidity Rescues - Automated emergency transfers
export const liquidityRescues = pgTable('liquidity_rescues', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    scenarioId: uuid('scenario_id').references(() => stressScenarios.id, { onDelete: 'cascade' }),
    triggerDate: timestamp('trigger_date').notNull(),
    triggerReason: text('trigger_reason').notNull(), // balance_critical, runway_depleted, threshold_breach
    sourceWalletId: uuid('source_wallet_id'), // Source for emergency funds
    targetWalletId: uuid('target_wallet_id'), // Target wallet to rescue
    transferAmount: numeric('transfer_amount', { precision: 12, scale: 2 }).notNull(),
    status: text('status').default('pending'), // pending, executed, failed, cancelled
    executedAt: timestamp('executed_at'),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
});

// Cash Flow Projections - AI-driven income/expense forecasts
export const cashFlowProjections = pgTable('cash_flow_projections', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    projectionDate: timestamp('projection_date').notNull(),
    projectedIncome: numeric('projected_income', { precision: 12, scale: 2 }).notNull(),
    projectedExpenses: numeric('projected_expenses', { precision: 12, scale: 2 }).notNull(),
    projectedBalance: numeric('projected_balance', { precision: 12, scale: 2 }).notNull(),
    confidence: doublePrecision('confidence').default(0.85), // AI confidence score
    modelType: text('model_type').default('arima'), // arima, lstm, prophet
    seasonalFactors: jsonb('seasonal_factors').default({}),
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
    userDateIdx: index('idx_cash_flow_user_date').on(table.userId, table.projectionDate),
}));

export const outboxEventsRelations = relations(outboxEvents, ({ one }) => ({
    tenant: one(tenants, {
        fields: [outboxEvents.tenantId],
        references: [tenants.id],
    }),
}));

export const sagaInstancesRelations = relations(sagaInstances, ({ one, many }) => ({
    tenant: one(tenants, {
        fields: [sagaInstances.tenantId],
        references: [tenants.id],
    }),
    stepExecutions: many(sagaStepExecutions),
}));

export const sagaStepExecutionsRelations = relations(sagaStepExecutions, ({ one }) => ({
    sagaInstance: one(sagaInstances, {
        fields: [sagaStepExecutions.sagaInstanceId],
        references: [sagaInstances.id],
    }),
}));

export const serviceIdentitiesRelations = relations(serviceIdentities, ({ many }) => ({
    certificates: many(serviceCertificates),
    authLogs: many(serviceAuthLogs),
}));

export const serviceCertificatesRelations = relations(serviceCertificates, ({ one }) => ({
    service: one(serviceIdentities, {
        fields: [serviceCertificates.serviceId],
        references: [serviceIdentities.id],
    }),
}));

export const serviceAuthLogsRelations = relations(serviceAuthLogs, ({ one }) => ({
    service: one(serviceIdentities, {
        fields: [serviceAuthLogs.serviceId],
        references: [serviceIdentities.id],
    }),
}));
