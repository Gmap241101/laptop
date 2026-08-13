import { useEffect } from 'react';
import { createPortal } from 'react-dom';

let modalScrollLockCount = 0;
let previousDocumentOverflow = '';
let previousBodyOverflow = '';
let previousBodyPaddingRight = '';

const lockDocumentScroll = () => {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;

  if (modalScrollLockCount === 0) {
    const documentElement = document.documentElement;
    const { body } = document;
    previousDocumentOverflow = documentElement.style.overflow;
    previousBodyOverflow = body.style.overflow;
    previousBodyPaddingRight = body.style.paddingRight;

    const scrollbarWidth = Math.max(0, window.innerWidth - documentElement.clientWidth);
    const computedBodyPaddingRight = Number.parseFloat(
      window.getComputedStyle(body).paddingRight || '0'
    ) || 0;

    documentElement.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${computedBodyPaddingRight + scrollbarWidth}px`;
    }
  }

  modalScrollLockCount += 1;
};

const unlockDocumentScroll = () => {
  if (typeof document === 'undefined') return;

  modalScrollLockCount = Math.max(0, modalScrollLockCount - 1);
  if (modalScrollLockCount !== 0) return;

  document.documentElement.style.overflow = previousDocumentOverflow;
  document.body.style.overflow = previousBodyOverflow;
  document.body.style.paddingRight = previousBodyPaddingRight;
};

export default function ModalPortal({ children, lockScroll = true, ...backdropProps }) {
  useEffect(() => {
    if (!lockScroll) return undefined;
    lockDocumentScroll();
    return unlockDocumentScroll;
  }, [lockScroll]);

  const backdrop = <div {...backdropProps}>{children}</div>;
  if (typeof document === 'undefined') return backdrop;
  return createPortal(backdrop, document.body);
}
