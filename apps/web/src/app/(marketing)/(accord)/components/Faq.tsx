'use client';

import { useState } from 'react';
import { Icon } from './Icon';

export type FaqEntry = { q: string; a: string };

export function Faq({ items }: { items: FaqEntry[] }) {
  const [open, setOpen] = useState(0);

  return (
    <div className="ac-faq">
      {items.map((item, i) => {
        const isOpen = open === i;
        return (
          <div key={item.q} className="ac-faq-item" data-open={isOpen}>
            <h3>
              <button
                type="button"
                className="ac-faq-q"
                aria-expanded={isOpen}
                aria-controls={`ac-faq-a-${i}`}
                onClick={() => setOpen(isOpen ? -1 : i)}
              >
                {item.q}
                <Icon name="plus" size={18} />
              </button>
            </h3>
            <div id={`ac-faq-a-${i}`} className="ac-faq-a" hidden={!isOpen}>
              {item.a}
            </div>
          </div>
        );
      })}
    </div>
  );
}
