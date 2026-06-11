import { PrismaClient, DonorType, DonationSource, ReceiptStatus } from '@magnus/db/types';
import { Prisma as PrismaRuntime } from '@magnus/db/types';
import { encryptValue, decryptValue } from '@magnus/db';

export type DonorDto = {
  id: string;
  orgId: string;
  donorType: DonorType;
  name: string;
  email: string | null;
  phone: string | null;
  addressJson: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DonationDto = {
  id: string;
  orgId: string;
  donorId: string;
  amount: string;
  currency: string;
  receivedAt: string;
  paymentMethod: string;
  referenceNumber: string | null;
  notes: string | null;
  source: DonationSource;
  importRowId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ReceiptDto = {
  id: string;
  orgId: string;
  donationId: string;
  receiptNumber: string;
  status: ReceiptStatus;
  issuedAt: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CsvPreviewRow = {
  lineNumber: number;
  valid: boolean;
  errors: string[];
  donorName: string;
  donorEmail: string | null;
  donorPhone: string | null;
  amount: number | null;
  paymentMethod: string;
  date: string;
};

export type CsvPreviewResult = {
  valid: boolean;
  totalRows: number;
  validRowsCount: number;
  invalidRowsCount: number;
  rows: CsvPreviewRow[];
};

// ─── Input Validation Primitives ─────────────────────────────────────────────

function sanitizeFormula(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.startsWith('=') || trimmed.startsWith('+') || trimmed.startsWith('-') || trimmed.startsWith('@')) {
    // Prepends a single quote to prevent spreadsheet formula injection
    return `'${trimmed}`;
  }
  return trimmed;
}

function validateEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const clean = email.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(clean)) {
    throw new Error('INVALID_EMAIL');
  }
  return clean;
}

function validatePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const clean = phone.trim();
  // Basic validation allowing digits, spaces, hyphens, and parenthesis
  const phoneRegex = /^[+]*[(]{0,1}[0-9]{1,4}[)]{0,1}[-\s\./0-9]*$/;
  if (!phoneRegex.test(clean)) {
    throw new Error('INVALID_PHONE');
  }
  return clean;
}

// ─── Service Methods ─────────────────────────────────────────────────────────

export async function listDonors(
  db: PrismaClient,
  orgId: string,
  options: { take?: number; skip?: number; search?: string } = {}
): Promise<DonorDto[]> {
  if (!orgId) throw new Error('ORG_CONTEXT_REQUIRED');
  const take = Math.min(500, Math.max(1, options.take ?? 50));
  const skip = Math.max(0, options.skip ?? 0);

  const where: any = { orgId };
  if (options.search) {
    where.name = { contains: options.search, mode: 'insensitive' };
  }

  const rows = await db.donor.findMany({
    where,
    orderBy: { name: 'asc' },
    take,
    skip,
  });

  return rows.map(r => ({
    id: r.id,
    orgId: r.orgId,
    donorType: r.donorType as DonorType,
    name: r.name,
    email: r.email,
    phone: r.phone,
    addressJson: r.addressJson ? decryptValue(r.addressJson) : null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

export async function createDonor(
  db: PrismaClient,
  orgId: string,
  data: {
    donorType?: DonorType;
    name: string;
    email?: string | null;
    phone?: string | null;
    addressJson?: string | null;
  }
): Promise<DonorDto> {
  if (!orgId) throw new Error('ORG_CONTEXT_REQUIRED');
  if (!data.name || !data.name.trim()) throw new Error('NAME_REQUIRED');

  const email = validateEmail(data.email);
  const phone = validatePhone(data.phone);
  const name = sanitizeFormula(data.name) || '';
  const donorType = data.donorType || DonorType.INDIVIDUAL;

  const addressVal = data.addressJson ? data.addressJson.trim() : null;
  const addressJson = addressVal ? encryptValue(addressVal) : null;

  try {
    const row = await db.donor.create({
      data: {
        orgId,
        donorType,
        name,
        email,
        phone,
        addressJson,
      },
    });

    return {
      id: row.id,
      orgId: row.orgId,
      donorType: row.donorType as DonorType,
      name: row.name,
      email: row.email,
      phone: row.phone,
      addressJson: row.addressJson ? decryptValue(row.addressJson) : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  } catch (err) {
    if (err instanceof PrismaRuntime.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new Error('DONOR_EMAIL_DUPLICATE');
    }
    throw err;
  }
}

export async function updateDonor(
  db: PrismaClient,
  orgId: string,
  donorId: string,
  data: {
    name?: string;
    email?: string | null;
    phone?: string | null;
    addressJson?: string | null;
  }
): Promise<DonorDto> {
  if (!orgId) throw new Error('ORG_CONTEXT_REQUIRED');
  if (!donorId) throw new Error('DONOR_ID_REQUIRED');

  // Verify ownership
  const existing = await db.donor.findFirst({
    where: { id: donorId, orgId },
  });
  if (!existing) throw new Error('DONOR_NOT_FOUND');

  const updateData: any = {};
  if (data.name !== undefined) {
    if (!data.name || !data.name.trim()) throw new Error('NAME_REQUIRED');
    updateData.name = sanitizeFormula(data.name);
  }
  if (data.email !== undefined) {
    updateData.email = validateEmail(data.email);
  }
  if (data.phone !== undefined) {
    updateData.phone = validatePhone(data.phone);
  }
  if (data.addressJson !== undefined) {
    updateData.addressJson = data.addressJson ? encryptValue(data.addressJson) : null;
  }

  try {
    const row = await db.donor.update({
      where: { id: donorId },
      data: updateData,
    });

    return {
      id: row.id,
      orgId: row.orgId,
      donorType: row.donorType as DonorType,
      name: row.name,
      email: row.email,
      phone: row.phone,
      addressJson: row.addressJson ? decryptValue(row.addressJson) : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  } catch (err) {
    if (err instanceof PrismaRuntime.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new Error('DONOR_EMAIL_DUPLICATE');
    }
    throw err;
  }
}

export async function getDonorDetail(
  db: PrismaClient,
  orgId: string,
  donorId: string
): Promise<DonorDto> {
  if (!orgId) throw new Error('ORG_CONTEXT_REQUIRED');
  const row = await db.donor.findFirst({
    where: { id: donorId, orgId },
  });
  if (!row) throw new Error('DONOR_NOT_FOUND');

  return {
    id: row.id,
    orgId: row.orgId,
    donorType: row.donorType as DonorType,
    name: row.name,
    email: row.email,
    phone: row.phone,
    addressJson: row.addressJson ? decryptValue(row.addressJson) : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function createManualDonation(
  db: PrismaClient,
  orgId: string,
  data: {
    donorId: string;
    amount: number;
    currency?: string;
    receivedAt: Date;
    paymentMethod: string;
    referenceNumber?: string;
    notes?: string;
  }
): Promise<DonationDto> {
  if (!orgId) throw new Error('ORG_CONTEXT_REQUIRED');
  if (!data.donorId) throw new Error('DONOR_ID_REQUIRED');
  if (data.amount <= 0) throw new Error('INVALID_AMOUNT');
  if (!data.receivedAt || Number.isNaN(data.receivedAt.getTime())) throw new Error('INVALID_DATE');

  // Verify donor exists and belongs to this organization
  const donor = await db.donor.findFirst({ where: { id: data.donorId, orgId } });
  if (!donor) throw new Error('DONOR_NOT_FOUND');

  const currency = (data.currency ?? 'USD').toUpperCase().trim().slice(0, 8);
  const paymentMethod = sanitizeFormula(data.paymentMethod) || 'MANUAL';
  const referenceNumber = sanitizeFormula(data.referenceNumber);
  const notes = sanitizeFormula(data.notes);

  const row = await db.donation.create({
    data: {
      orgId,
      donorId: data.donorId,
      amount: data.amount,
      currency,
      receivedAt: data.receivedAt,
      paymentMethod,
      referenceNumber,
      notes,
      source: DonationSource.MANUAL,
    },
  });

  return {
    id: row.id,
    orgId: row.orgId,
    donorId: row.donorId,
    amount: row.amount.toString(),
    currency: row.currency,
    receivedAt: row.receivedAt.toISOString(),
    paymentMethod: row.paymentMethod,
    referenceNumber: row.referenceNumber,
    notes: row.notes,
    source: row.source as DonationSource,
    importRowId: row.importRowId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listDonations(
  db: PrismaClient,
  orgId: string,
  options: { take?: number; skip?: number; donorId?: string } = {}
): Promise<DonationDto[]> {
  if (!orgId) throw new Error('ORG_CONTEXT_REQUIRED');
  const take = Math.min(500, Math.max(1, options.take ?? 50));
  const skip = Math.max(0, options.skip ?? 0);

  const where: any = { orgId };
  if (options.donorId) {
    where.donorId = options.donorId;
  }

  const rows = await db.donation.findMany({
    where,
    orderBy: { receivedAt: 'desc' },
    take,
    skip,
  });

  return rows.map(r => ({
    id: r.id,
    orgId: r.orgId,
    donorId: r.donorId,
    amount: r.amount.toString(),
    currency: r.currency,
    receivedAt: r.receivedAt.toISOString(),
    paymentMethod: r.paymentMethod,
    referenceNumber: r.referenceNumber,
    notes: r.notes,
    source: r.source as DonationSource,
    importRowId: r.importRowId,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

export async function issueReceipt(db: PrismaClient, orgId: string, donationId: string): Promise<ReceiptDto> {
  if (!orgId) throw new Error('ORG_CONTEXT_REQUIRED');
  if (!donationId) throw new Error('DONATION_ID_REQUIRED');

  // Verify donation belongs to organization
  const donation = await db.donation.findFirst({
    where: { id: donationId, orgId },
  });
  if (!donation) throw new Error('DONATION_NOT_FOUND');

  // Check if receipt already exists (idempotency)
  const existing = await db.donationReceipt.findFirst({
    where: { donationId },
  });
  if (existing) {
    return {
      id: existing.id,
      orgId: existing.orgId,
      donationId: existing.donationId,
      receiptNumber: existing.receiptNumber,
      status: existing.status as ReceiptStatus,
      issuedAt: existing.issuedAt ? existing.issuedAt.toISOString() : null,
      voidedAt: existing.voidedAt ? existing.voidedAt.toISOString() : null,
      voidReason: existing.voidReason,
      createdAt: existing.createdAt.toISOString(),
      updatedAt: existing.updatedAt.toISOString(),
    };
  }

  // Generate deterministic receipt number: REC-YYYYMMDD-[RANDOM_HEX]
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
  const hexSeq = crypto.randomBytes(3).toString('hex').toUpperCase();
  const receiptNumber = `REC-${dateStr}-${hexSeq}`;

  try {
    const row = await db.donationReceipt.create({
      data: {
        orgId,
        donationId,
        receiptNumber,
        status: ReceiptStatus.ISSUED,
        issuedAt: today,
      },
    });

    return {
      id: row.id,
      orgId: row.orgId,
      donationId: row.donationId,
      receiptNumber: row.receiptNumber,
      status: row.status as ReceiptStatus,
      issuedAt: row.issuedAt ? row.issuedAt.toISOString() : null,
      voidedAt: row.voidedAt ? row.voidedAt.toISOString() : null,
      voidReason: row.voidReason,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  } catch (err) {
    if (err instanceof PrismaRuntime.PrismaClientKnownRequestError && err.code === 'P2002') {
      // Retry once on collision
      const retryHex = crypto.randomBytes(3).toString('hex').toUpperCase();
      const retryNum = `REC-${dateStr}-${retryHex}`;
      const row = await db.donationReceipt.create({
        data: {
          orgId,
          donationId,
          receiptNumber: retryNum,
          status: ReceiptStatus.ISSUED,
          issuedAt: today,
        },
      });
      return {
        id: row.id,
        orgId: row.orgId,
        donationId: row.donationId,
        receiptNumber: row.receiptNumber,
        status: row.status as ReceiptStatus,
        issuedAt: row.issuedAt ? row.issuedAt.toISOString() : null,
        voidedAt: row.voidedAt ? row.voidedAt.toISOString() : null,
        voidReason: row.voidReason,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      };
    }
    throw err;
  }
}

export async function getReceiptMetadata(db: PrismaClient, orgId: string, receiptId: string): Promise<ReceiptDto> {
  if (!orgId) throw new Error('ORG_CONTEXT_REQUIRED');
  const row = await db.donationReceipt.findFirst({
    where: { id: receiptId, orgId },
  });
  if (!row) throw new Error('RECEIPT_NOT_FOUND');

  return {
    id: row.id,
    orgId: row.orgId,
    donationId: row.donationId,
    receiptNumber: row.receiptNumber,
    status: row.status as ReceiptStatus,
    issuedAt: row.issuedAt ? row.issuedAt.toISOString() : null,
    voidedAt: row.voidedAt ? row.voidedAt.toISOString() : null,
    voidReason: row.voidReason,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function voidReceipt(db: PrismaClient, orgId: string, receiptId: string, reason: string): Promise<ReceiptDto> {
  if (!orgId) throw new Error('ORG_CONTEXT_REQUIRED');
  if (!reason || !reason.trim()) throw new Error('VOID_REASON_REQUIRED');

  const existing = await db.donationReceipt.findFirst({
    where: { id: receiptId, orgId },
  });
  if (!existing) throw new Error('RECEIPT_NOT_FOUND');

  const row = await db.donationReceipt.update({
    where: { id: receiptId },
    data: {
      status: ReceiptStatus.VOIDED,
      voidedAt: new Date(),
      voidReason: sanitizeFormula(reason),
    },
  });

  return {
    id: row.id,
    orgId: row.orgId,
    donationId: row.donationId,
    receiptNumber: row.receiptNumber,
    status: row.status as ReceiptStatus,
    issuedAt: row.issuedAt ? row.issuedAt.toISOString() : null,
    voidedAt: row.voidedAt ? row.voidedAt.toISOString() : null,
    voidReason: row.voidReason,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ─── CSV Import Implementation ───────────────────────────────────────────────

import crypto from 'crypto';

function parseCsv(content: string): string[][] {
  const lines: string[][] = [];
  let row: string[] = [];
  let currentVal = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          // Escaped quote
          currentVal += '"';
          i++;
        } else {
          // Close quote
          inQuotes = false;
        }
      } else {
        currentVal += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        row.push(currentVal);
        currentVal = '';
      } else if (char === '\r' || char === '\n') {
        row.push(currentVal);
        currentVal = '';
        if (row.length > 0 && (row.length > 1 || row[0] !== '')) {
          lines.push(row);
        }
        row = [];
        if (char === '\r' && nextChar === '\n') {
          i++;
        }
      } else {
        currentVal += char;
      }
    }
  }

  if (row.length > 0 || currentVal !== '') {
    row.push(currentVal);
    if (row.length > 0 && (row.length > 1 || row[0] !== '')) {
      lines.push(row);
    }
  }

  return lines;
}

export function previewCsvImport(orgId: string, csvContent: string): CsvPreviewResult {
  if (!orgId) throw new Error('ORG_CONTEXT_REQUIRED');
  if (!csvContent || !csvContent.trim()) throw new Error('CSV_CONTENT_REQUIRED');

  const rawLines = parseCsv(csvContent);
  if (rawLines.length === 0) throw new Error('EMPTY_CSV');

  const headers = rawLines[0].map(h => h.trim().toLowerCase());
  const nameIdx = headers.indexOf('name');
  const emailIdx = headers.indexOf('email');
  const phoneIdx = headers.indexOf('phone');
  const amountIdx = headers.indexOf('amount');
  const methodIdx = headers.indexOf('payment_method');
  const dateIdx = headers.indexOf('date');

  if (nameIdx === -1) {
    throw new Error('CSV_MISSING_HEADER_NAME');
  }

  const rows: CsvPreviewRow[] = [];
  let validRowsCount = 0;
  let invalidRowsCount = 0;

  const rowLimit = 1000;
  const dataLines = rawLines.slice(1);
  const importLines = dataLines.slice(0, rowLimit);

  for (let i = 0; i < importLines.length; i++) {
    const rawRow = importLines[i];
    const lineNumber = i + 2; // header is line 1, lines are 1-indexed

    const errors: string[] = [];
    const donorName = rawRow[nameIdx]?.trim() || '';
    const donorEmailRaw = emailIdx !== -1 ? rawRow[emailIdx]?.trim() : '';
    const donorPhoneRaw = phoneIdx !== -1 ? rawRow[phoneIdx]?.trim() : '';
    const amountRaw = amountIdx !== -1 ? rawRow[amountIdx]?.trim() : '';
    const paymentMethod = methodIdx !== -1 ? rawRow[methodIdx]?.trim() || 'MANUAL' : 'MANUAL';
    const dateRaw = dateIdx !== -1 ? rawRow[dateIdx]?.trim() : '';

    if (!donorName) {
      errors.push('NAME_REQUIRED');
    }

    let donorEmail: string | null = null;
    if (donorEmailRaw) {
      try {
        donorEmail = validateEmail(donorEmailRaw);
      } catch {
        errors.push('INVALID_EMAIL');
      }
    }

    let donorPhone: string | null = null;
    if (donorPhoneRaw) {
      try {
        donorPhone = validatePhone(donorPhoneRaw);
      } catch {
        errors.push('INVALID_PHONE');
      }
    }

    let amount: number | null = null;
    if (amountRaw) {
      const num = parseFloat(amountRaw);
      if (Number.isNaN(num) || num <= 0) {
        errors.push('INVALID_AMOUNT');
      } else {
        amount = num;
      }
    }

    let date = '';
    if (dateRaw) {
      const d = new Date(dateRaw);
      if (Number.isNaN(d.getTime())) {
        errors.push('INVALID_DATE');
      } else {
        date = d.toISOString();
      }
    } else if (amount) {
      errors.push('DATE_REQUIRED_FOR_DONATION');
    }

    const valid = errors.length === 0;
    if (valid) {
      validRowsCount++;
    } else {
      invalidRowsCount++;
    }

    rows.push({
      lineNumber,
      valid,
      errors,
      donorName: sanitizeFormula(donorName) ?? '',
      donorEmail,
      donorPhone,
      amount,
      paymentMethod: sanitizeFormula(paymentMethod) ?? 'MANUAL',
      date,
    });
  }

  return {
    valid: invalidRowsCount === 0 && rows.length > 0,
    totalRows: rows.length,
    validRowsCount,
    invalidRowsCount,
    rows,
  };
}

export async function commitCsvImport(
  db: PrismaClient,
  orgId: string,
  csvContent: string,
  fileName: string
): Promise<{ batchId: string; rowsProcessed: number; donationsCreated: number }> {
  if (!orgId) throw new Error('ORG_CONTEXT_REQUIRED');
  const preview = previewCsvImport(orgId, csvContent);
  if (!preview.valid) {
    throw new Error('CSV_VALIDATION_FAILED');
  }

  // Run in database transaction
  const result = await db.$transaction(async (tx) => {
    // Create Import Batch
    const batch = await tx.donationImportBatch.create({
      data: {
        orgId,
        fileName,
        rowCount: preview.totalRows,
      },
    });

    let donationsCreated = 0;

    for (const r of preview.rows) {
      // 1. Find or create Donor (by orgId + email matching)
      let donorId = '';
      if (r.donorEmail) {
        const existingDonor = await tx.donor.findFirst({
          where: { orgId, email: r.donorEmail },
        });
        if (existingDonor) {
          donorId = existingDonor.id;
        }
      }

      if (!donorId) {
        // Create new donor
        const newDonor = await tx.donor.create({
          data: {
            orgId,
            donorType: DonorType.INDIVIDUAL,
            name: r.donorName,
            email: r.donorEmail || null,
            phone: r.donorPhone || null,
          },
        });
        donorId = newDonor.id;
      }

      // Create import row record
      const importRow = await tx.donationImportRow.create({
        data: {
          orgId,
          batchId: batch.id,
          rawLineNumber: r.lineNumber,
          rawContent: JSON.stringify(r),
          status: 'SUCCESS',
          donorId,
        },
      });

      // 2. Create Donation if amount is provided
      if (r.amount !== null && r.date) {
        await tx.donation.create({
          data: {
            orgId,
            donorId,
            amount: r.amount,
            currency: 'USD',
            receivedAt: new Date(r.date),
            paymentMethod: r.paymentMethod,
            source: DonationSource.CSV_IMPORT,
            importRowId: importRow.id,
          },
        });
        donationsCreated++;
      }
    }

    return {
      batchId: batch.id,
      rowsProcessed: preview.totalRows,
      donationsCreated,
    };
  });

  return result;
}
