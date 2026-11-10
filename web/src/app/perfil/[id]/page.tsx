'use client';
import { useParams } from 'next/navigation';
import { ProfileView } from '@/components/profile-view';
export default function PublicProfile() { const { id } = useParams<{ id: string }>(); return <ProfileView id={id} />; }
