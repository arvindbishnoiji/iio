import React from 'react';

const LATEX_SYMBOLS: Record<string, string> = {
  '\\alpha': 'α',
  '\\beta': 'β',
  '\\gamma': 'γ',
  '\\delta': 'δ',
  '\\Delta': 'Δ',
  '\\epsilon': 'ε',
  '\\theta': 'θ',
  '\\Theta': 'Θ',
  '\\lambda': 'λ',
  '\\Lambda': 'Λ',
  '\\mu': 'μ',
  '\\nu': 'ν',
  '\\pi': 'π',
  '\\Pi': 'Π',
  '\\rho': 'ρ',
  '\\sigma': 'σ',
  '\\Sigma': 'Σ',
  '\\tau': 'τ',
  '\\phi': 'φ',
  '\\Phi': 'Φ',
  '\\omega': 'ω',
  '\\Omega': 'Ω',
  '\\times': '×',
  '\\cdot': '·',
  '\\div': '÷',
  '\\pm': '±',
  '\\mp': '∓',
  '\\leq': '≤',
  '\\le': '≤',
  '\\geq': '≥',
  '\\ge': '≥',
  '\\neq': '≠',
  '\\ne': '≠',
  '\\approx': '≈',
  '\\equiv': '≡',
  '\\infty': '∞',
  '\\rightarrow': '→',
  '\\to': '→',
  '\\leftarrow': '←',
  '\\leftrightarrow': '↔',
  '\\Rightarrow': '⇒',
  '\\degree': '°',
  '\\circ': '°',
  '\\int': '∫',
  '\\sum': '∑',
  '\\prod': '∏',
  '\\partial': '∂',
  '\\nabla': '∇',
};

function formatLatexExpression(expr: string): string {
  let out = expr;
  // Convert \frac{a}{b} -> (a)/(b)
  out = out.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '($1)/($2)');
  // Convert \sqrt{a} -> √(a)
  out = out.replace(/\\sqrt\{([^{}]+)\}/g, '√($1)');
  // Convert \text{...} or \mathrm{...} -> ...
  out = out.replace(/\\(?:text|mathrm|mathbf)\{([^{}]+)\}/g, '$1');
  // Replace common LaTeX symbols
  for (const [k, v] of Object.entries(LATEX_SYMBOLS)) {
    out = out.split(k).join(v);
  }
  return out;
}

interface MathTextProps {
  text: string;
  className?: string;
}

/**
 * Safely renders text containing MathJax/LaTeX segments ($...$, $$...$$, \(...\), \[...\])
 * without using dangerouslySetInnerHTML. Preserves original LaTeX expressions in title attributes
 * and formats math tokens cleanly with graceful wrapping.
 */
export const MathText: React.FC<MathTextProps> = ({ text, className = '' }) => {
  if (!text) return null;

  const pattern = /(\$\$[\s\S]+?\$\$|\$[^$\n]+\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\))/g;
  const parts = text.split(pattern);

  return (
    <span className={`break-words leading-relaxed ${className}`}>
      {parts.map((part, idx) => {
        if (!part) return null;
        const isBlockMath =
          (part.startsWith('$$') && part.endsWith('$$')) ||
          (part.startsWith('\\[') && part.endsWith('\\]'));
        const isInlineMath =
          !isBlockMath &&
          ((part.startsWith('$') && part.endsWith('$')) ||
            (part.startsWith('\\(') && part.endsWith('\\)')));

        if (isBlockMath || isInlineMath) {
          const inner = isBlockMath
            ? part.slice(2, -2).trim()
            : part.startsWith('$')
            ? part.slice(1, -1).trim()
            : part.slice(2, -2).trim();
          const readable = formatLatexExpression(inner);

          return (
            <code
              key={idx}
              title={part}
              data-latex={inner}
              className={
                isBlockMath
                  ? 'my-2 block overflow-x-auto rounded-lg border border-indigo-100 bg-indigo-50/70 px-3 py-2 font-mono text-sm text-indigo-950'
                  : 'mx-0.5 inline-block rounded border border-indigo-100 bg-indigo-50/70 px-1.5 py-0.5 font-mono text-[0.92em] text-indigo-950'
              }
            >
              {readable}
            </code>
          );
        }

        return <React.Fragment key={idx}>{part}</React.Fragment>;
      })}
    </span>
  );
};
