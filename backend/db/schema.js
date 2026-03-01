
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
    preferences: jsonb('preferences').default({
        notifications: { email: true, push: true, sms: false },
        theme: 'auto',
        language: 'en'
    }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Categories Table
export const categories = pgTable('categories', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    name: text('name').notNull(),
    description: text('description'),
    color: text('color').notNull().default('#3B82F6'),
    icon: text('icon').default('tag'),
    type: text('type').default('expense'), // enum: 'expense', 'income', 'both'
    isDefault: boolean('is_default').default(false),
    isActive: boolean('is_active').default(true),
    parentCategoryId: uuid('parent_category_id').references(() => categories.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    budget: jsonb('budget').default({ monthly: 0, yearly: 0 }),
    spendingLimit: numeric('spending_limit', { precision: 12, scale: 2 }).default('0'),
    priority: integer('priority').default(0),
    metadata: jsonb('metadata').default({
        usageCount: 0,
        lastUsed: null,
        averageAmount: 0
    }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Expenses Table
export const expenses = pgTable('expenses', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    currency: text('currency').default('USD'),
    description: text('description').notNull(),
    subcategory: text('subcategory'),
    date: timestamp('date').defaultNow().notNull(),
    paymentMethod: text('payment_method').default('other'),
    location: jsonb('location'), // { name, address, coordinates: { lat, lng } }
    tags: jsonb('tags').default([]), // Store generic array as JSONB or text[]
    receipt: jsonb('receipt'),
    isRecurring: boolean('is_recurring').default(false),
    recurringPattern: jsonb('recurring_pattern'),
    notes: text('notes'),
    status: text('status').default('completed'),
    metadata: jsonb('metadata').default({
        createdBy: 'system',
        lastModified: null,
        version: 1,
        flags: []
    }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Goals Table
export const goals = pgTable('goals', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    targetAmount: numeric('target_amount', { precision: 12, scale: 2 }).notNull(),
    currentAmount: numeric('current_amount', { precision: 12, scale: 2 }).default('0'),
    currency: text('currency').default('USD'),
    type: text('type').default('savings'),
    priority: text('priority').default('medium'),
    status: text('status').default('active'),
    deadline: timestamp('deadline').notNull(),
    startDate: timestamp('start_date').defaultNow(),
    completedDate: timestamp('completed_date'),
    milestones: jsonb('milestones').default([]),
    recurringContribution: jsonb('recurring_contribution').default({ amount: 0, frequency: 'monthly' }),
    tags: jsonb('tags').default([]),
    notes: text('notes'),
    isPublic: boolean('is_public').default(false),
    metadata: jsonb('metadata').default({
        lastContribution: null,
        totalContributions: 0,
        averageContribution: 0,
        streakDays: 0
    }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Device Sessions Table for token management
export const deviceSessions = pgTable('device_sessions', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    deviceId: text('device_id').notNull(),
    deviceName: text('device_name'),
    deviceType: text('device_type').default('web'), // web, mobile, tablet
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    refreshToken: text('refresh_token').notNull().unique(),
    accessToken: text('access_token'),
    isActive: boolean('is_active').default(true),
    lastActivity: timestamp('last_activity').defaultNow(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Token Blacklist Table
export const tokenBlacklist = pgTable('token_blacklist', {
    id: uuid('id').defaultRandom().primaryKey(),
    token: text('token').notNull().unique(),
    tokenType: text('token_type').notNull(), // access, refresh
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    reason: text('reason').default('logout'), // logout, password_change, security
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
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
    parentCategory: one(categories, {
        fields: [categories.parentCategoryId],
        references: [categories.id],
        relationName: 'parent_child_category'
    }),
    childCategories: many(categories, {
        relationName: 'parent_child_category'
    }),
    expenses: many(expenses),
    goals: many(goals),
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

export const deviceSessionsRelations = relations(deviceSessions, ({ one }) => ({
    user: one(users, {
        fields: [deviceSessions.userId],
        references: [users.id],
    }),
}));

export const tokenBlacklistRelations = relations(tokenBlacklist, ({ one }) => ({
    user: one(users, {
        fields: [tokenBlacklist.userId],
        references: [users.id],
    }),
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
