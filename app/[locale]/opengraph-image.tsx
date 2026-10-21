import {ImageResponse} from 'next/og';
import {BRAND_NAME} from '@/lib/config';
import en from '@/messages/en.json';
import az from '@/messages/az.json';

export const runtime = 'edge';
export const alt = BRAND_NAME;
export const size = {width: 1200, height: 630};
export const contentType = 'image/png';
export default async function OpenGraphImage({params}: {params: Promise<{locale: string}>}) {
  const copy = (await params).locale === 'az' ? az.Phase9.og : en.Phase9.og;
  return new ImageResponse(<div style={{width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 80,
    background: 'linear-gradient(130deg, #082b34, #086d69)', color: 'white', fontFamily: 'sans-serif'}}>
    <div style={{fontSize: 30, letterSpacing: 8, textTransform: 'uppercase', color: '#8ff2d8'}}>{BRAND_NAME}</div>
    <div style={{fontSize: 70, fontWeight: 700, marginTop: 32, maxWidth: 950}}>{copy.headline}</div>
    <div style={{fontSize: 29, marginTop: 30, color: '#d0ebe7'}}>{copy.subtitle}</div>
  </div>, size);
}
