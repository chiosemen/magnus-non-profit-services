import LoginForm from './LoginForm';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return (
    <div className="panel panelPad">
      <h1 className="h1" style={{ fontSize: 34, marginBottom: 10 }}>Login</h1>
      <p className="subhead" style={{ marginBottom: 0 }}>
        Staff access is provisioned by a Magnus operator after payment clearance.
        There is no self-serve registration.
      </p>
      <LoginForm />
    </div>
  );
}
