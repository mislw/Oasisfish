/**
 * Cross-process serialization for the installation-owned profile module
 * fallback repair.
 * @module @deepseek-ai/dsh-app-boot/profile-heal-lock
 */

import { randomUUID } from 'node:crypto'
import {
  closeSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync,
} from 'node:fs'
import type { Stats } from 'node:fs'
import { join } from 'node:path'

const LOCK_FILENAME = '.module-fallback-heal.lock'
const LOCK_WAIT_TIMEOUT_MS = 30_000
const LOCK_INITIALIZATION_TIMEOUT_MS = 1_000
const LOCK_POLL_MS = 10
const sleeper = new Int32Array(new SharedArrayBuffer(4))

function errorCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException | null)?.code
}

function lockStat(lockPath: string): Stats | undefined {
  try {
    return lstatSync(lockPath)
  } catch (error) {
    /* v8 ignore else -- a non-ENOENT result requires a filesystem fault. */
    if (errorCode(error) === 'ENOENT') return undefined
    /* v8 ignore next -- preserve that filesystem failure unchanged. */
    throw error
  }
}

function readLock(lockPath: string): string | undefined {
  try {
    return readFileSync(lockPath, 'utf8')
  } catch (error) {
    /* v8 ignore next -- disappearance between stat and read is an external race. */
    if (errorCode(error) === 'ENOENT') return undefined
    /* v8 ignore next -- unexpected read failures require a filesystem fault. */
    throw error
  }
}

function sameInode(left: Stats, right: Stats): boolean {
  return left.dev === right.dev && left.ino === right.ino
}

function parseLockOwner(record: string): number | undefined {
  const match = /^([1-9]\d*) [0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\n$/i.exec(record)
  if (match === null) return undefined
  const owner = Number(match[1])
  /* v8 ignore next -- an all-digit hostile record can exceed the safe-integer range. */
  return Number.isSafeInteger(owner) ? owner : undefined
}

function recordMayBeIncomplete(record: string): boolean {
  return record === '' || (!record.endsWith('\n') && /^[1-9]\d*(?: [0-9a-f-]*)?$/i.test(record))
}

/**
 * Probe whether a lock owner is still alive.
 * @param owner - process id recorded in the lock.
 * @param kill - process signal probe; injectable for platform error coverage.
 * @returns false only when the operating system reports `ESRCH`.
 */
export function profileHealLockOwnerIsAlive(
  owner: number,
  kill: (pid: number, signal: 0) => true = (pid, signal) => process.kill(pid, signal),
): boolean {
  try {
    kill(owner, 0)
    return true
  } catch (error) {
    switch (errorCode(error)) {
      case 'ESRCH': return false
      case 'EPERM': return true
      default: throw error
    }
  }
}

function recoveryError(lockPath: string, condition: string): Error {
  return new Error(
    `dsh: ${condition} profile module fallback repair lock ${JSON.stringify(lockPath)}. `
    + 'Confirm no Harness process is starting, remove it manually, and retry.',
  )
}

function ownershipChangedError(lockPath: string): Error {
  return new Error(`dsh: profile module fallback repair lock ownership changed for ${lockPath}; refusing to remove it`)
}

function waitForPoll(): void {
  Atomics.wait(sleeper, 0, 0, LOCK_POLL_MS)
}

function releaseOwnedLock(lockPath: string, ownedRecord: string, ownedStat: Stats): void {
  const currentStat = lockStat(lockPath)
  if (
    currentStat === undefined
    || !currentStat.isFile()
    || currentStat.isSymbolicLink()
    || !sameInode(currentStat, ownedStat)
    || readLock(lockPath) !== ownedRecord
  ) {
    throw ownershipChangedError(lockPath)
  }
  try {
    unlinkSync(lockPath)
  } catch (error) {
    /* v8 ignore next -- disappearance between ownership verification and unlink reports ownership loss. */
    if (errorCode(error) === 'ENOENT') throw ownershipChangedError(lockPath)
    /* v8 ignore next -- unexpected unlink failures pass through unchanged. */
    throw error
  }
}

/**
 * Acquire exclusive ownership of profile module fallback repair for one
 * Harness home. Live owners are awaited, dead owners are recovered only after
 * their inode and record remain unchanged, and invalid records require manual
 * recovery.
 * @param home - Harness home whose `profiles` directory owns the lock.
 * @returns a release function that removes only the caller's exact lock.
 */
export function acquireProfilesModuleFallbackHealLock(home: string): () => void {
  const profilesDir = join(home, 'profiles')
  const lockPath = join(profilesDir, LOCK_FILENAME)
  mkdirSync(profilesDir, { recursive: true })
  const deadline = Date.now() + LOCK_WAIT_TIMEOUT_MS
  const ownedRecord = `${String(process.pid)} ${randomUUID()}\n`
  let initializingLock: { deadline: number; dev: number; ino: number } | undefined

  while (true) {
    try {
      const handle = openSync(lockPath, 'wx', 0o600)
      let ownedStat: Stats
      try {
        ownedStat = fstatSync(handle)
        writeFileSync(handle, ownedRecord)
      } finally {
        closeSync(handle)
      }
      const publishedStat = lockStat(lockPath)
      /* v8 ignore next 7 -- replacement between exclusive creation and verification is externally raced. */
      if (
        publishedStat === undefined
        || !publishedStat.isFile()
        || publishedStat.isSymbolicLink()
        || !sameInode(publishedStat, ownedStat)
      ) {
        throw ownershipChangedError(lockPath)
      }
      return () => { releaseOwnedLock(lockPath, ownedRecord, ownedStat) }
    } catch (error) {
      /* v8 ignore next -- only EEXIST is lock contention; other open/write failures pass through. */
      if (errorCode(error) !== 'EEXIST') throw error
    }

    const existingStat = lockStat(lockPath)
    /* v8 ignore next -- a contender may remove the lock between open failure and inspection. */
    if (existingStat === undefined) continue
    if (!existingStat.isFile() || existingStat.isSymbolicLink()) {
      throw recoveryError(lockPath, 'invalid')
    }
    const existingRecord = readLock(lockPath)
    /* v8 ignore next -- a contender may remove the lock between stat and read. */
    if (existingRecord === undefined) continue
    const verifiedStat = lockStat(lockPath)
    /* v8 ignore next -- a contender may remove the lock between read and verification. */
    if (verifiedStat === undefined) continue
    /* v8 ignore next 3 -- a contender may replace the lock with a non-file during verification. */
    if (!verifiedStat.isFile() || verifiedStat.isSymbolicLink()) {
      throw recoveryError(lockPath, 'invalid')
    }
    /* v8 ignore next -- inode replacement during verification restarts discovery. */
    if (!sameInode(verifiedStat, existingStat)) continue

    const owner = parseLockOwner(existingRecord)
    if (owner === undefined) {
      if (!recordMayBeIncomplete(existingRecord)) throw recoveryError(lockPath, 'invalid')
      const now = Date.now()
      if (
        /* v8 ignore next -- a different partial lock inode resets the initialization deadline. */
        initializingLock === undefined
        || initializingLock.dev !== existingStat.dev
        || initializingLock.ino !== existingStat.ino
      ) {
        initializingLock = {
          deadline: now + LOCK_INITIALIZATION_TIMEOUT_MS,
          dev: existingStat.dev,
          ino: existingStat.ino,
        }
      }
      /* v8 ignore next -- a permanently partial record requires the fixed one-second recovery timeout. */
      if (now >= initializingLock.deadline) throw recoveryError(lockPath, 'invalid')
      waitForPoll()
      continue
    }

    initializingLock = undefined
    if (profileHealLockOwnerIsAlive(owner)) {
      /* v8 ignore next 3 -- a live owner exceeding the fixed startup timeout requires a 30-second test. */
      if (Date.now() >= deadline) {
        throw new Error(`dsh: timed out waiting for profile module fallback repair lock ${lockPath}`)
      }
      waitForPoll()
      continue
    }

    const staleStat = lockStat(lockPath)
    /* v8 ignore next 8 -- replacement while recovering a dead owner restarts discovery. */
    if (
      staleStat === undefined
      || !staleStat.isFile()
      || staleStat.isSymbolicLink()
      || !sameInode(staleStat, existingStat)
      || readLock(lockPath) !== existingRecord
    ) {
      continue
    }
    try {
      unlinkSync(lockPath)
    } catch (error) {
      /* v8 ignore next -- another contender may remove the verified stale lock first. */
      if (errorCode(error) !== 'ENOENT') throw error
    }
  }
}

/** Filename of the cross-process profile module fallback repair lock. */
export const PROFILE_MODULE_FALLBACK_HEAL_LOCK_FILENAME = LOCK_FILENAME
