import { useContext } from 'react';
import { ReauthContext, type RequestReauth } from './reauth-context';

export function useReauth(): RequestReauth {
  const value = useContext(ReauthContext);
  if (!value) throw new Error('useReauth phải nằm trong <ReauthProvider>');
  return value;
}
