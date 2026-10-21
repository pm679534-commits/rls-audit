'use client';

import {ResponsiveContainer, CartesianGrid, XAxis, YAxis, Tooltip, Legend, BarChart, Bar} from 'recharts';

export function AdminMetricsChart({points, signups, scans, failed}: {points: {day: string; signups: number; scans: number; failed: number}[]; signups: string; scans: string; failed: string}) {
  return <div className="h-72 w-full" role="img" aria-label={`${signups}, ${scans}, ${failed}`}><ResponsiveContainer width="100%" height="100%"><BarChart data={points} margin={{top: 8, right: 6, left: -18, bottom: 0}}><CartesianGrid strokeDasharray="3 3" opacity={0.25} /><XAxis dataKey="day" tickFormatter={(value: string) => value.slice(5,10)} fontSize={11} /><YAxis allowDecimals={false} fontSize={11} /><Tooltip labelFormatter={(value) => String(value).slice(0,10)} /><Legend /><Bar name={scans} dataKey="scans" fill="hsl(var(--primary))" radius={[3,3,0,0]} /><Bar name={signups} dataKey="signups" fill="hsl(var(--ring))" radius={[3,3,0,0]} /><Bar name={failed} dataKey="failed" fill="hsl(var(--destructive))" radius={[3,3,0,0]} /></BarChart></ResponsiveContainer></div>;
}
