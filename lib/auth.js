import Credentials from '@auth/express/providers/credentials';
import bcrypt from 'bcryptjs';
import supabase from './db.js';

export const authConfig = {
  providers: [
    Credentials({
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) return null;
        const { data: admin } = await supabase
          .from('admins')
          .select('*')
          .eq('username', String(credentials.username).toLowerCase().trim())
          .single();
        if (!admin) return null;
        const valid = await bcrypt.compare(String(credentials.password), admin.password);
        if (!valid) return null;
        await supabase.from('admins')
          .update({ last_login: new Date().toISOString() })
          .eq('id', admin.id);
        return { id: admin.id, username: admin.username, role: admin.role, name: admin.username };
      },
    }),
  ],
  session: { strategy: 'jwt' },
  pages: { signIn: '/' },
  trustHost: true,
  callbacks: {
    async jwt({ token, user }) {
      if (user) { token.username = user.username; token.role = user.role; }
      return token;
    },
    async session({ session, token }) {
      if (token) { session.user.username = token.username; session.user.role = token.role; }
      return session;
    },
  },
};
