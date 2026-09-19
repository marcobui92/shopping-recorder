import assert from 'node:assert/strict'
import test from 'node:test'

import { AppError } from '../errors.js'
import { parseCompareRecorderActivitiesInput, parseCreateMediaAssetInput, parseCreateRecorderActivityInput, parseListRecorderActivitiesInput, parseUpdateRecorderActivityInput } from './domain.js'

test('recorder activity input is normalized', () => {
  assert.deepEqual(parseCreateRecorderActivityInput({
    notes: '  Seal visible  ',
    occurredAt: '2026-09-03T08:30:00+00:00',
    operationType: 'packing',
    reference: ' ORDER-1042 ',
    storageProvider: 's3',
  }), {
    notes: 'Seal visible',
    occurredAt: '2026-09-03T08:30:00.000Z',
    operationType: 'packing',
    reference: 'ORDER-1042',
    storageProvider: 's3',
  })
})

test('media asset input requires a safe size and lowercase SHA-256', () => {
  const valid = parseCreateMediaAssetInput({
    contentType: 'IMAGE/JPEG',
    mediaType: 'image',
    originalFilename: ' seal.jpg ',
    sha256: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    sizeBytes: 256,
  })
  assert.equal(valid.contentType, 'image/jpeg')
  assert.equal(valid.originalFilename, 'seal.jpg')

  assert.throws(() => parseCreateMediaAssetInput({
    contentType: 'image/jpeg', mediaType: 'image', originalFilename: 'seal.jpg', sha256: 'ABC', sizeBytes: 256,
  }), (error: unknown) => error instanceof AppError && error.code === 'VALIDATION_ERROR')
})

test('recorder history query applies defaults and validates its timestamp range', () => {
  assert.deepEqual(parseListRecorderActivitiesInput({ operationType: 'packing', page: '2' }), {
    reference: undefined,
    occurredFrom: undefined,
    occurredTo: undefined,
    operationType: 'packing',
    page: 2,
    pageSize: 20,
    sortDirection: 'desc',
    status: undefined,
    storageProvider: undefined,
  })
  assert.throws(() => parseListRecorderActivitiesInput({
    occurredFrom: '2026-09-04T00:00:00.000Z', occurredTo: '2026-09-03T00:00:00.000Z',
  }), (error: unknown) => error instanceof AppError && error.code === 'VALIDATION_ERROR')
})

test('comparison requires one normalized exact reference', () => {
  assert.deepEqual(parseCompareRecorderActivitiesInput({ reference: ' ORDER-1042 ' }), { reference: 'ORDER-1042' })
  for (const value of ['', '   ', 'a'.repeat(161), 'bad\0value']) {
    assert.throws(() => parseCompareRecorderActivitiesInput({ reference: value }), (error: unknown) => (
      error instanceof AppError && error.code === 'VALIDATION_ERROR'
    ))
  }
  assert.throws(() => parseCompareRecorderActivitiesInput({ reference: 'A', page: 1 }), (error: unknown) => (
    error instanceof AppError && error.code === 'VALIDATION_ERROR'
  ))
})

test('recorder metadata update is partial, normalized, and rejects empty or unknown input', () => {
  assert.deepEqual(parseUpdateRecorderActivityInput({ notes: ' corrected ', reference: null }), {
    notes: 'corrected', reference: null,
  })
  assert.throws(() => parseUpdateRecorderActivityInput({}), (error: unknown) => (
    error instanceof AppError && error.code === 'VALIDATION_ERROR'
  ))
  assert.throws(() => parseUpdateRecorderActivityInput({ storageProvider: 's3' }), (error: unknown) => (
    error instanceof AppError && error.code === 'VALIDATION_ERROR'
  ))
})
