import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function PersonsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/report');
  }, [router]);
  return null;
}
