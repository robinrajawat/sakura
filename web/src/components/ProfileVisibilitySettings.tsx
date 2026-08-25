import { useAuthStore } from '../store/authStore';
import { useProfileStore } from '../store/profileStore';
import type { ThemeTokens } from '../store/themeStore';

/**
 * §6.8 slice: "Account" settings category -- profile discoverability toggle, direct port of
 * legacy's real `#profile-visibility-toggle` (legacy/index.html:14119-14239's own profile
 * machinery, see profileStore.ts's own header). Off (private) by default for every account;
 * turning it on is what makes `profileStore.search`/`findByEmail` able to find this account at
 * all -- a private profile can never be shared with, matching legacy's own real "share by
 * searching a public profile" model.
 */
export function ProfileVisibilitySettings({ t }: { t: ThemeTokens }) {
  const user = useAuthStore((s) => s.user);
  const visibility = useProfileStore((s) => s.visibility);
  const setDiscoverable = useProfileStore((s) => s.setDiscoverable);

  const sectionHeaderStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '.04em',
    textTransform: 'uppercase',
    color: t.mutedText,
    margin: '0 0 8px',
    paddingBottom: 6,
    borderBottom: `1px solid ${t.border}`
  };

  if (!user) {
    return (
      <>
        <div style={sectionHeaderStyle}>Account</div>
        <div style={{ color: t.mutedText, fontSize: 12 }}>Sign in to manage your profile.</div>
      </>
    );
  }

  return (
    <>
      <div style={sectionHeaderStyle}>Account</div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
        <input
          type="checkbox"
          checked={visibility === 'public'}
          onChange={(e) => void setDiscoverable(user.uid, e.currentTarget.checked)}
          aria-label="Discoverable by name/email for sharing"
        />
        <span>
          Discoverable for sharing
          <div style={{ fontSize: 11, color: t.mutedText, marginTop: 2 }}>
            Lets other Sakura users find your account by name or email when they share a document with you. Off by
            default -- while off, no one can find or share with this account.
          </div>
        </span>
      </label>
    </>
  );
}
