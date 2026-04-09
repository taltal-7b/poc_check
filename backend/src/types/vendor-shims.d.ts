declare module 'nodemailer';
declare module 'bcryptjs';

declare module 'pdfkit' {
  import { Readable } from 'stream';
  interface PDFDocumentOptions {
    margin?: number;
    size?: string | [number, number];
  }
  export default class PDFDocument extends Readable {
    constructor(options?: PDFDocumentOptions);
    pipe<T extends NodeJS.WritableStream>(destination: T): T;
    fontSize(size: number): this;
    font(name: string): this;
    fillColor(color: string): this;
    text(text: string, x?: number, y?: number, options?: Record<string, unknown>): this;
    moveDown(lines?: number): this;
    addPage(): this;
    end(): void;
    get page(): { height: number; width: number };
    get y(): number;
  }
}
