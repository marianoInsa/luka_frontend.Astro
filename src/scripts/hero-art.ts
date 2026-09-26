export type SequenceApply = (index: number) => void;

export function runSequence(count: number, step: number, apply: SequenceApply): void {
  const advance = (index: number): void => {
    if (index >= count) return;

    apply(index);
    setTimeout(() => advance(index + 1), step);
  };

  advance(0);
}

const STEP = 1100;

function initStack(root: HTMLElement): void {
  const hits = [...root.querySelectorAll<HTMLButtonElement>('.stack-card__hit')];

  for (const hit of hits) {
    hit.addEventListener('click', () => {
      for (const other of hits) {
        const isFront = other === hit;
        other.setAttribute('aria-pressed', String(isFront));
        other.closest('.stack-card')?.classList.toggle('is-front', isFront);
      }
    });
  }
}

function initSequence(root: HTMLElement): void {
  if (!document.documentElement.classList.contains('hero-js')) return;

  const phone = root.querySelector<HTMLElement>('[data-seq]');
  if (!phone) return;

  const chat = phone.querySelector<HTMLElement>('.phone__chat');
  const segments = [...phone.querySelectorAll<HTMLElement>('[data-seg]')];
  if (!chat || segments.length === 0) return;

  const apply: SequenceApply = (index) => {
    for (const segment of segments) {
      if (segment.dataset.seg === 'typing') segment.classList.remove('is-on');
    }

    const current = segments[index];
    if (!current) return;

    current.classList.add('is-on');
    chat.scrollTop = current.offsetTop + current.offsetHeight - chat.clientHeight;
  };

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          observer.disconnect();
          runSequence(segments.length, STEP, apply);
        }
      }
    },
    { threshold: 0.3 },
  );

  observer.observe(phone);
}

export function startHeroArt(): void {
  const root = document.querySelector<HTMLElement>('[data-hero-cards]');
  if (!root) return;

  initStack(root);
  initSequence(root);
}
