import { useEffect, useState, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { api } from './lib/api.js';
import { AuthCtx, MetaCtx, RequireRole } from './components/Shell.jsx';
import { PixelTransition, ScrollProgress, RevealObserver } from './components/motion.jsx';
import { StarField } from './components/cosmos.jsx';
import { Landing, Login, Register, Forgot, Reset, Verify } from './pages/Public.jsx';
import FounderDashboard from './pages/founder/Dashboard.jsx';
import FounderCompany from './pages/founder/Company.jsx';
import FounderDocuments from './pages/founder/Documents.jsx';
import FounderAnalysis from './pages/founder/Analysis.jsx';
import FounderTeaser from './pages/founder/Teaser.jsx';
import { FounderInterest, FounderRequests } from './pages/founder/Interest.jsx';
import InvestorDashboard from './pages/investor/Dashboard.jsx';
import InvestorMandate from './pages/investor/Mandate.jsx';
import InvestorDiscover from './pages/investor/Discover.jsx';
import { InvestorShortlist, InvestorIntroductions, InvestorOpportunity } from './pages/investor/Lists.jsx';
import HostDashboard from './pages/host/Dashboard.jsx';
import HostPipeline from './pages/host/Pipeline.jsx';
import HostDeal from './pages/host/Deal.jsx';
import { HostInterest, HostIntroductions, HostTeasers } from './pages/host/Flow.jsx';
import { HostUsers, HostUser } from './pages/host/Users.jsx';
import { HostSettings, HostAudit } from './pages/host/Admin.jsx';

export default function App() {
  const [user, setUser] = useState(undefined);
  const [meta, setMeta] = useState(null);
  useEffect(() => {
    api('/auth/me').then(r => setUser(r.user)).catch(() => setUser(null));
    api('/meta').then(setMeta).catch(() => setMeta(null));
  }, []);
  const logout = useCallback(async () => { await api('/auth/logout', { method: 'POST' }).catch(() => {}); setUser(null); }, []);
  if (user === undefined) return null;
  return (
    <AuthCtx.Provider value={{ user, setUser, logout }}>
      <MetaCtx.Provider value={meta}>
        <BrowserRouter>
          <StarField />
          <PixelTransition />
          <ScrollProgress />
          <RevealObserver />
          <Routes>
            <Route path="/" element={user ? <Navigate to={`/${user.role}`} replace /> : <Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot" element={<Forgot />} />
            <Route path="/reset" element={<Reset />} />
            <Route path="/verify" element={<Verify />} />
            <Route path="/founder" element={<RequireRole role="founder" />}>
              <Route index element={<FounderDashboard />} />
              <Route path="company" element={<FounderCompany />} />
              <Route path="documents" element={<FounderDocuments />} />
              <Route path="analysis" element={<FounderAnalysis />} />
              <Route path="teaser" element={<FounderTeaser />} />
              <Route path="interest" element={<FounderInterest />} />
              <Route path="requests" element={<FounderRequests />} />
            </Route>
            <Route path="/investor" element={<RequireRole role="investor" />}>
              <Route index element={<InvestorDashboard />} />
              <Route path="mandate" element={<InvestorMandate />} />
              <Route path="discover" element={<InvestorDiscover />} />
              <Route path="shortlist" element={<InvestorShortlist />} />
              <Route path="introductions" element={<InvestorIntroductions />} />
              <Route path="opportunities/:id" element={<InvestorOpportunity />} />
            </Route>
            <Route path="/host" element={<RequireRole role="host" />}>
              <Route index element={<HostDashboard />} />
              <Route path="pipeline" element={<HostPipeline />} />
              <Route path="deals/:id" element={<HostDeal />} />
              <Route path="interest" element={<HostInterest />} />
              <Route path="introductions" element={<HostIntroductions />} />
              <Route path="teasers" element={<HostTeasers />} />
              <Route path="users" element={<HostUsers />} />
              <Route path="users/:id" element={<HostUser />} />
              <Route path="settings" element={<HostSettings />} />
              <Route path="audit" element={<HostAudit />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </MetaCtx.Provider>
    </AuthCtx.Provider>
  );
}
