'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

// A popover stays open across client navigation, so it is closed whenever the path changes.
export function PopoverAutoClose({ id }: { id: string }) {
  const pathname = usePathname();

  useEffect(() => {
    const element = document.getElementById(id);
    if (element?.matches(':popover-open')) element.hidePopover();
  }, [id, pathname]);

  return null;
}
