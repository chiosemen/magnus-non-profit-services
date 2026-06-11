import { PrismaClient, EventRegistrationStatus, Prisma } from '@magnus/db/types';

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export interface VolunteerDto {
  id: string;
  orgId: string;
  name: string;
  email: string | null;
  phone: string | null;
  donorId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface EventDto {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  startDate: Date;
  endDate: Date;
  campaignId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface EventRegistrationDto {
  id: string;
  orgId: string;
  eventId: string;
  volunteerId: string;
  status: EventRegistrationStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface SponsorshipTierDto {
  id: string;
  orgId: string;
  campaignId: string;
  name: string;
  amount: Prisma.Decimal;
  description: string | null;
  createdAt: Date;
}

export async function createVolunteer(
  db: PrismaClient,
  orgId: string,
  data: {
    name: string;
    email?: string;
    phone?: string;
    donorId?: string;
  }
): Promise<VolunteerDto> {
  if (!orgId) throw new ValidationError('Organization context is missing.');
  if (!data.name?.trim()) throw new ValidationError('Volunteer name is required.');

  // Validate donor if linked
  if (data.donorId) {
    const donor = await db.donor.findFirst({
      where: { id: data.donorId, orgId },
    });
    if (!donor) throw new ValidationError('Linked donor not found.');
  }

  // Check unique email per org if present
  if (data.email?.trim()) {
    const existing = await db.volunteer.findFirst({
      where: { orgId, email: data.email.trim() },
    });
    if (existing) {
      throw new ValidationError(`Volunteer with email ${data.email} already exists.`);
    }
  }

  const volunteer = await db.volunteer.create({
    data: {
      orgId,
      name: data.name.trim(),
      email: data.email?.trim() || null,
      phone: data.phone?.trim() || null,
      donorId: data.donorId || null,
    },
  });

  return volunteer;
}

export async function listVolunteers(db: PrismaClient, orgId: string): Promise<VolunteerDto[]> {
  if (!orgId) throw new ValidationError('Organization context is missing.');
  return await db.volunteer.findMany({
    where: { orgId },
    orderBy: { name: 'asc' },
  });
}

export async function logVolunteerHours(
  db: PrismaClient,
  orgId: string,
  data: {
    volunteerId: string;
    eventId?: string;
    hours: number;
    date: Date | string;
    activityLabel?: string;
  }
): Promise<any> {
  if (!orgId) throw new ValidationError('Organization context is missing.');
  if (data.hours <= 0) throw new ValidationError('Hours must be greater than zero.');

  const volunteer = await db.volunteer.findFirst({
    where: { id: data.volunteerId, orgId },
  });
  if (!volunteer) throw new NotFoundError('Volunteer profile not found.');

  if (data.eventId) {
    const event = await db.event.findFirst({
      where: { id: data.eventId, orgId },
    });
    if (!event) throw new NotFoundError('Event not found.');
  }

  const occurredAt = new Date(data.date);
  if (Number.isNaN(occurredAt.getTime())) throw new ValidationError('Invalid date.');

  const sourceRef = `manual-log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const log = await db.volunteerEvent.create({
    data: {
      orgId,
      occurredAt,
      hours: new Prisma.Decimal(data.hours),
      activityLabel: data.activityLabel?.trim() || null,
      sourceSystem: 'MANUAL',
      sourceRef,
      volunteerId: data.volunteerId,
      eventId: data.eventId || null,
    },
  });

  return log;
}

export async function createEvent(
  db: PrismaClient,
  orgId: string,
  data: {
    name: string;
    description?: string;
    startDate: Date | string;
    endDate: Date | string;
    campaignId?: string;
  }
): Promise<EventDto> {
  if (!orgId) throw new ValidationError('Organization context is missing.');
  if (!data.name?.trim()) throw new ValidationError('Event name is required.');

  const startDate = new Date(data.startDate);
  const endDate = new Date(data.endDate);

  if (Number.isNaN(startDate.getTime())) throw new ValidationError('Invalid start date.');
  if (Number.isNaN(endDate.getTime())) throw new ValidationError('Invalid end date.');
  if (startDate > endDate) throw new ValidationError('Start date cannot be after end date.');

  if (data.campaignId) {
    const campaign = await db.campaign.findFirst({
      where: { id: data.campaignId, orgId },
    });
    if (!campaign) throw new ValidationError('Campaign not found.');
  }

  const event = await db.event.create({
    data: {
      orgId,
      name: data.name.trim(),
      description: data.description?.trim() || null,
      startDate,
      endDate,
      campaignId: data.campaignId || null,
    },
  });

  return event;
}

export async function listEvents(db: PrismaClient, orgId: string): Promise<EventDto[]> {
  if (!orgId) throw new ValidationError('Organization context is missing.');
  return await db.event.findMany({
    where: { orgId },
    orderBy: { startDate: 'desc' },
  });
}

export async function registerAttendee(
  db: PrismaClient,
  orgId: string,
  data: {
    eventId: string;
    volunteerId: string;
    status?: EventRegistrationStatus;
  }
): Promise<EventRegistrationDto> {
  if (!orgId) throw new ValidationError('Organization context is missing.');

  const event = await db.event.findFirst({
    where: { id: data.eventId, orgId },
  });
  if (!event) throw new NotFoundError('Event not found.');

  const volunteer = await db.volunteer.findFirst({
    where: { id: data.volunteerId, orgId },
  });
  if (!volunteer) throw new NotFoundError('Volunteer not found.');

  const status = data.status || EventRegistrationStatus.REGISTERED;

  const registration = await db.eventRegistration.upsert({
    where: {
      orgId_eventId_volunteerId: {
        orgId,
        eventId: data.eventId,
        volunteerId: data.volunteerId,
      },
    },
    update: { status },
    create: {
      orgId,
      eventId: data.eventId,
      volunteerId: data.volunteerId,
      status,
    },
  });

  return registration;
}

export async function createSponsorshipTier(
  db: PrismaClient,
  orgId: string,
  data: {
    campaignId: string;
    name: string;
    amount: number | string | Prisma.Decimal;
    description?: string;
  }
): Promise<SponsorshipTierDto> {
  if (!orgId) throw new ValidationError('Organization context is missing.');
  if (!data.name?.trim()) throw new ValidationError('Sponsorship tier name is required.');

  const campaign = await db.campaign.findFirst({
    where: { id: data.campaignId, orgId },
  });
  if (!campaign) throw new ValidationError('Campaign not found.');

  const amt = new Prisma.Decimal(data.amount);
  if (amt.isNegative()) throw new ValidationError('Sponsorship amount cannot be negative.');

  const tier = await db.sponsorshipTier.create({
    data: {
      orgId,
      campaignId: data.campaignId,
      name: data.name.trim(),
      amount: amt,
      description: data.description?.trim() || null,
    },
  });

  return tier;
}
