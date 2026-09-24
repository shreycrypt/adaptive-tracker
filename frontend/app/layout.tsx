import { Syne, Plus_Jakarta_Sans, Space_Grotesk } from 'next/font/google';
import './globals.css';

// Primary Display Font (Headings like "Good to see you.")
const syne = Syne({
  subsets: ['latin'],
  variable: '--font-syne',
  display: 'swap',
});

// Primary Body Font (Labels, descriptions, text)
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-jakarta',
  display: 'swap',
});

// Precision Numerical Font (Calories, grams, weight graphs, percentages)
const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-numbers',
  display: 'swap',
});

export const metadata = {
  title: 'Metabolic & Nutrition Tracker',
  description: 'Precision athletic nutrition and body recomposition ledger',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${syne.variable} ${jakarta.variable} ${spaceGrotesk.variable}`}>
      <body className="bg-[#09090B] text-slate-100 font-sans antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
