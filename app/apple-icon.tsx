import {ImageResponse} from 'next/og';

export const size = {width: 180, height: 180};
export const contentType = 'image/png';
export default function AppleIcon() {
  return new ImageResponse(<div style={{display: 'flex', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', borderRadius: 38, background: '#123b56'}}>
    <svg width="125" height="140" viewBox="0 0 64 64" fill="none"><path d="M32 5 53 14v17c0 15-8 24-21 30C19 55 11 46 11 31V14L32 5Z" stroke="#a6e8dc" strokeWidth="4" strokeLinejoin="round" /><path d="m20 31 9 9 16-18" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" /></svg>
  </div>, size);
}
