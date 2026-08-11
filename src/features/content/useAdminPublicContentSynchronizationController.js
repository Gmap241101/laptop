import { useEffect, useRef } from 'react';

import {
  readPolicyContentCutoverConfig,
  syncAllPolicyContentDomainsFromFirestore,
} from './policyContentCutover.js';
import {
  readSiteContentCutoverConfig,
  syncAllSiteContentDomainsFromFirestore,
} from './siteContentCutover.js';

const REPAIR_SESSION_KEY = 'mk_phase33_public_content_authority_repair_20260812_0045';

const hasRepairCompleted = () => {
  try {
    return globalThis.sessionStorage?.getItem?.(REPAIR_SESSION_KEY) === '1';
  } catch {
    return false;
  }
};

const markRepairCompleted = () => {
  try {
    globalThis.sessionStorage?.setItem?.(REPAIR_SESSION_KEY, '1');
  } catch {
    // A blocked sessionStorage must not prevent the actual synchronization.
  }
};

export default function useAdminPublicContentSynchronizationController({
  firebaseAuthUser,
  isAdminAuthenticated,
  triggerToast,
  view,
}) {
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (view !== 'admin' || !isAdminAuthenticated || !firebaseAuthUser?.uid) return undefined;
    if (inFlightRef.current || hasRepairCompleted()) return undefined;

    const siteConfig = readSiteContentCutoverConfig();
    const policyConfig = readPolicyContentCutoverConfig();
    const shouldSyncSite = Boolean(siteConfig.authorityRequested && siteConfig.writeThroughRequested);
    const shouldSyncPolicy = Boolean(policyConfig.authorityRequested && policyConfig.writeThroughRequested);
    if (!shouldSyncSite && !shouldSyncPolicy) return undefined;

    let cancelled = false;
    inFlightRef.current = true;

    const synchronize = async () => {
      try {
        // Administrator management remains Firestore-backed during Phase 33, while
        // public reads are PostgreSQL-authoritative. Reconcile all transitional
        // domains once per administrator browser session so pre-cutover/missed writes
        // cannot leave public home, popup, footer or policy content incomplete.
        if (shouldSyncSite) {
          await syncAllSiteContentDomainsFromFirestore({ config: siteConfig });
        }
        if (shouldSyncPolicy) {
          await syncAllPolicyContentDomainsFromFirestore({ config: policyConfig });
        }
        if (cancelled) return;
        markRepairCompleted();
      } catch (error) {
        if (cancelled) return;
        console.error('Phase 33 public content authority reconciliation failed:', error);
        triggerToast?.(
          `공개 콘텐츠 PostgreSQL 동기화에 실패했습니다. 오류 코드: ${error?.code || error?.message || 'unknown-error'}`,
          'error'
        );
      } finally {
        if (!cancelled) inFlightRef.current = false;
      }
    };

    void synchronize();
    return () => {
      cancelled = true;
      inFlightRef.current = false;
    };
  }, [firebaseAuthUser?.uid, isAdminAuthenticated, triggerToast, view]);
}
