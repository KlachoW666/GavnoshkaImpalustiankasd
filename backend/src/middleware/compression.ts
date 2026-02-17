/**
 * Lightweight response compression middleware using Node.js built-in zlib.
 * Supports gzip and deflate. No external dependencies required.
 */

import { Request, Response, NextFunction } from 'express';
import { createGzip, createDeflate } from 'zlib';

const MIN_SIZE = 1024; // Don't compress responses smaller than 1KB

const COMPRESSIBLE_TYPES = /^(text\/|application\/json|application\/javascript|application\/xml|image\/svg)/;

export function compression() {
  return (req: Request, res: Response, next: NextFunction) => {
    const acceptEncoding = req.headers['accept-encoding'] || '';

    // Skip if client doesn't accept compression or it's a WebSocket upgrade
    if (!acceptEncoding || req.headers.upgrade) {
      next();
      return;
    }

    const originalWrite = res.write;
    const originalEnd = res.end;
    let encoding: 'gzip' | 'deflate' | null = null;
    let stream: ReturnType<typeof createGzip> | ReturnType<typeof createDeflate> | null = null;
    let headersSent = false;

    function setupCompression(): boolean {
      if (headersSent) return !!stream;
      headersSent = true;

      const contentType = res.getHeader('content-type');
      const contentLength = res.getHeader('content-length');

      // Skip if content type is not compressible
      if (contentType && !COMPRESSIBLE_TYPES.test(String(contentType))) return false;
      // Skip small responses
      if (contentLength && Number(contentLength) < MIN_SIZE) return false;
      // Skip if already encoded
      if (res.getHeader('content-encoding')) return false;

      if (typeof acceptEncoding === 'string' && acceptEncoding.includes('gzip')) {
        encoding = 'gzip';
        stream = createGzip({ level: 6 });
      } else if (typeof acceptEncoding === 'string' && acceptEncoding.includes('deflate')) {
        encoding = 'deflate';
        stream = createDeflate({ level: 6 });
      }

      if (stream && encoding) {
        res.removeHeader('content-length');
        res.setHeader('content-encoding', encoding);
        res.setHeader('vary', 'Accept-Encoding');
        stream.pipe(res as unknown as NodeJS.WritableStream);
        return true;
      }
      return false;
    }

    res.write = function (this: Response, chunk: any, ...args: any[]): boolean {
      if (!headersSent) setupCompression();
      if (stream) {
        return stream.write(chunk, ...(args as [any]));
      }
      return originalWrite.apply(this, [chunk, ...args] as any);
    } as any;

    res.end = function (this: Response, chunk?: any, ...args: any[]): Response {
      if (!headersSent) setupCompression();
      if (stream) {
        if (chunk) stream.write(chunk);
        stream.end();
        return this;
      }
      return originalEnd.apply(this, [chunk, ...args] as any);
    } as any;

    next();
  };
}
