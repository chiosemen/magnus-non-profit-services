/**
 * Magnus Grant Generator — DocumentGenerator
 * Produces professionally formatted DOCX and PDF grant proposals
 * Uses docx library for Word documents, pdf-lib for PDFs
 */

import {
  Document, Packer, Paragraph, TextRun, Run, HeadingLevel, AlignmentType,
  BorderStyle, Table, TableRow, TableCell, WidthType, PageBreak,
  convertInchesToTwip, Header, Footer, PageNumber,
} from 'docx';
import { PDFDocument, StandardFonts, rgb, PageSizes } from 'pdf-lib';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProposalSection {
  sectionType: string;
  title: string;
  content: string;
  wordCount: number;
  wordLimit?: number;
}

export interface ProposalMetadata {
  applicationId: string;
  orgName: string;
  ein: string;
  funderName: string;
  programName: string;
  requestedAmount: number;
  submissionDate: string;
  contactName: string;
  contactEmail: string;
  sections: ProposalSection[];
}

export type OutputFormat = 'docx' | 'pdf' | 'both';

export interface GeneratedDocument {
  format: 'docx' | 'pdf';
  filePath: string;
  fileName: string;
  fileSizeBytes: number;
  pageCount?: number;
  generatedAt: Date;
}

// ─── Generator ────────────────────────────────────────────────────────────────

export class DocumentGenerator {
  private readonly outputDir: string;

  constructor() {
    this.outputDir = process.env['OUTPUT_DIR'] ?? './generated-documents';
  }

  // ─── Public API ──────────────────────────────────────────────────────────────

  async generate(metadata: ProposalMetadata, format: OutputFormat = 'docx'): Promise<GeneratedDocument[]> {
    await mkdir(this.outputDir, { recursive: true });
    const results: GeneratedDocument[] = [];

    if (format === 'docx' || format === 'both') {
      results.push(await this.generateDOCX(metadata));
    }
    if (format === 'pdf' || format === 'both') {
      results.push(await this.generatePDF(metadata));
    }

    return results;
  }

  // ─── DOCX ────────────────────────────────────────────────────────────────────

  async generateDOCX(metadata: ProposalMetadata): Promise<GeneratedDocument> {
    const doc = new Document({
      creator: 'Magnus Nonprofit OS',
      title: `Grant Proposal — ${metadata.funderName}`,
      description: `${metadata.orgName} — ${metadata.programName}`,
      styles: {
        paragraphStyles: [
          {
            id: 'Normal',
            name: 'Normal',
            run: { font: 'Times New Roman', size: 24 },
            paragraph: { spacing: { line: 360 } }, // Double-spaced
          },
        ],
      },
      sections: [{
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: metadata.orgName, bold: true, size: 20 }),
                  new TextRun({ text: ` | ${metadata.funderName} Grant Application`, size: 20 }),
                ],
                alignment: AlignmentType.RIGHT,
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: 'Page ', size: 18 }),
                  new Run({ children: [PageNumber.CURRENT] }),
                  new TextRun({ text: ` | EIN: ${metadata.ein}`, size: 18, color: '666666' }),
                ],
                alignment: AlignmentType.CENTER,
              }),
            ],
          }),
        },
        children: [
          // Cover page
          new Paragraph({
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: `Grant Proposal`, bold: true, size: 52 })],
            spacing: { before: 2000, after: 400 },
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: metadata.funderName, size: 32, color: '333333' })],
            spacing: { after: 200 },
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: metadata.programName, size: 28, italics: true, color: '555555' })],
            spacing: { after: 800 },
          }),
          // Cover table
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              this.coverTableRow('Applicant Organization', metadata.orgName),
              this.coverTableRow('EIN', metadata.ein),
              this.coverTableRow('Amount Requested', `$${metadata.requestedAmount.toLocaleString()}`),
              this.coverTableRow('Submission Date', metadata.submissionDate),
              this.coverTableRow('Primary Contact', `${metadata.contactName} | ${metadata.contactEmail}`),
            ],
          }),
          // Page break before content
          new Paragraph({ children: [new PageBreak()] }),
          // Sections
          ...metadata.sections.flatMap(section => this.buildSectionParagraphs(section)),
        ],
      }],
    });

    const fileName = this.sanitizeFilename(
      `${metadata.orgName}-${metadata.funderName}-Grant-Proposal.docx`
    );
    const filePath = join(this.outputDir, fileName);
    const buffer = await Packer.toBuffer(doc);
    await writeFile(filePath, buffer);

    return {
      format: 'docx',
      filePath,
      fileName,
      fileSizeBytes: buffer.byteLength,
      generatedAt: new Date(),
    };
  }

  // ─── PDF ─────────────────────────────────────────────────────────────────────

  async generatePDF(metadata: ProposalMetadata): Promise<GeneratedDocument> {
    const pdfDoc = await PDFDocument.create();
    const timesRoman = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    const timesBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
    const timesItalic = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);

    const margin = 72; // 1 inch
    const lineHeight = 18;
    const bodySize = 12;
    const headingSize = 16;
    const titleSize = 24;

    // Cover page
    let page = pdfDoc.addPage(PageSizes.Letter);
    let { width, height } = page.getSize();
    let y = height - margin;

    const drawText = (text: string, options: {
      font?: typeof timesRoman;
      size?: number;
      x?: number;
      color?: [number, number, number];
      indent?: number;
    } = {}) => {
      const x = options.x ?? margin + (options.indent ?? 0);
      const lines = this.wrapText(text, width - 2 * margin - (options.indent ?? 0), options.font ?? timesRoman, options.size ?? bodySize);

      for (const line of lines) {
        if (y < margin + lineHeight * 3) {
          page = pdfDoc.addPage(PageSizes.Letter);
          y = height - margin;
          // Add header
          page.drawText(`${metadata.orgName} | ${metadata.funderName}`, {
            x: margin, y: height - margin / 2,
            size: 9, font: timesRoman, color: rgb(0.4, 0.4, 0.4),
          });
        }
        const [r, g, b] = options.color ?? [0, 0, 0];
        page.drawText(line, {
          x, y,
          size: options.size ?? bodySize,
          font: options.font ?? timesRoman,
          color: rgb(r!, g!, b!),
        });
        y -= lineHeight;
      }
      y -= lineHeight * 0.3;
    };

    // Cover page title
    page.drawText('GRANT PROPOSAL', {
      x: width / 2 - 100, y: height / 2 + 80,
      size: titleSize, font: timesBold, color: rgb(0.1, 0.1, 0.4),
    });
    page.drawText(metadata.funderName, {
      x: width / 2 - (metadata.funderName.length * 5), y: height / 2 + 40,
      size: headingSize, font: timesRoman,
    });
    page.drawText(metadata.orgName, {
      x: width / 2 - (metadata.orgName.length * 4), y: height / 2,
      size: 14, font: timesBold,
    });

    // Content pages
    page = pdfDoc.addPage(PageSizes.Letter);
    y = height - margin;

    for (const section of metadata.sections) {
      if (y < margin + lineHeight * 8) {
        page = pdfDoc.addPage(PageSizes.Letter);
        y = height - margin;
      }

      drawText(section.title, { font: timesBold, size: headingSize });
      if (section.wordLimit) {
        drawText(`Word Count: ${section.wordCount} / ${section.wordLimit}`, {
          font: timesItalic, size: 9, color: [0.4, 0.4, 0.4],
        });
      }
      y -= lineHeight * 0.5;
      drawText(section.content, { font: timesRoman, size: bodySize });
      y -= lineHeight;
    }

    // Add page numbers
    const pages = pdfDoc.getPages();
    pages.forEach((p, i) => {
      p.drawText(`${i + 1} / ${pages.length}`, {
        x: width / 2 - 15, y: margin / 2,
        size: 9, font: timesRoman, color: rgb(0.5, 0.5, 0.5),
      });
    });

    const fileName = this.sanitizeFilename(
      `${metadata.orgName}-${metadata.funderName}-Grant-Proposal.pdf`
    );
    const filePath = join(this.outputDir, fileName);
    const pdfBytes = await pdfDoc.save();
    await writeFile(filePath, pdfBytes);

    return {
      format: 'pdf',
      filePath,
      fileName,
      fileSizeBytes: pdfBytes.byteLength,
      pageCount: pdfDoc.getPageCount(),
      generatedAt: new Date(),
    };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private buildSectionParagraphs(section: ProposalSection): Paragraph[] {
    const paragraphs: Paragraph[] = [
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: section.title, bold: true, size: 28 })],
        spacing: { before: 400, after: 200 },
      }),
    ];

    if (section.wordLimit) {
      paragraphs.push(new Paragraph({
        children: [new TextRun({
          text: `Word count: ${section.wordCount} / ${section.wordLimit}`,
          italics: true, size: 18, color: '888888',
        })],
        spacing: { after: 200 },
      }));
    }

    const contentParagraphs = section.content.split('\n\n').filter(p => p.trim());
    for (const para of contentParagraphs) {
      paragraphs.push(new Paragraph({
        children: [new TextRun({ text: para.trim(), size: 24 })],
        spacing: { after: 240 },
        indent: { firstLine: convertInchesToTwip(0.5) },
      }));
    }

    return paragraphs;
  }

  private coverTableRow(label: string, value: string): TableRow {
    return new TableRow({
      children: [
        new TableCell({
          width: { size: 30, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 20 })] })],
          borders: { bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' } },
        }),
        new TableCell({
          width: { size: 70, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ children: [new TextRun({ text: value, size: 20 })] })],
          borders: { bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' } },
        }),
      ],
    });
  }

  private wrapText(text: string, maxWidth: number, font: { widthOfTextAtSize: (t: string, s: number) => number }, size: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const testWidth = font.widthOfTextAtSize(testLine, size);
      if (testWidth > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);
    return lines;
  }

  private sanitizeFilename(name: string): string {
    return name.replace(/[^a-zA-Z0-9\-_.]/g, '-').replace(/-+/g, '-');
  }
}

export default DocumentGenerator;
