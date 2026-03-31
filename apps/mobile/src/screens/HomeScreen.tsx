/**
 * HomeScreen — read-only org readiness summary (via Next.js BFF)
 */

import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import TabBar from '../components/TabBar';
import { apiClient, type OrgReadinessPayload } from '../services/api';

function UnavailableLine({ message }: { message: string }) {
  return <Text style={styles.unavailable}>{message}</Text>;
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

export default function HomeScreen() {
  const { user } = useAuth();
  const [payload, setPayload] = useState<OrgReadinessPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.getOrgReadiness();
      setPayload(data);
    } catch (e) {
      setPayload(null);
      setError(e instanceof Error ? e.message : 'Could not load dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const renderOrg = (s: OrgReadinessPayload['org']) => {
    if (!s.available) return <UnavailableLine message={s.message} />;
    const o = s.data;
    return (
      <>
        <Row label="Name" value={o.name} />
        <Row label="EIN" value={o.ein} />
        <Row label="Tier" value={o.subscriptionTier} />
        <Row label="Compliance items (count)" value={String(o.complianceItemCount)} />
        <Row label="Grants (count)" value={String(o.grantCount)} />
      </>
    );
  };

  const renderCompliance = (s: OrgReadinessPayload['compliance']) => {
    if (!s.available) return <UnavailableLine message={s.message} />;
    return (
      <>
        <Row label="Items" value={String(s.data.itemCount)} />
        <Row label="Next due" value={s.data.nextDueDate ?? 'None upcoming'} />
      </>
    );
  };

  const renderGovernance = (s: OrgReadinessPayload['governance']) => {
    if (!s.available) return <UnavailableLine message={s.message} />;
    const g = s.data;
    return (
      <>
        <Row label="Board members" value={String(g.boardMembersCount)} />
        <Row label="Readiness" value={g.complete ? 'Complete' : 'In progress'} />
        <Row label="Completion" value={`${Math.round(g.completionRate * 100)}%`} />
        <Row label="Issues" value={String(g.issueCount)} />
        <Row label="Checks" value={`${g.totalChecks} total`} />
      </>
    );
  };

  const renderRestricted = (s: OrgReadinessPayload['restrictedFunds']) => {
    if (!s.available) return <UnavailableLine message={s.message} />;
    const r = s.data;
    return (
      <>
        <Row label="Funds" value={String(r.fundCount)} />
        <Row label="Total restricted (USD)" value={r.totalRestrictedAmountUsd.toFixed(2)} />
      </>
    );
  };

  const renderAudit = (s: OrgReadinessPayload['auditPrep']) => {
    if (!s.available) return <UnavailableLine message={s.message} />;
    const a = s.data;
    return (
      <>
        <Row label="Status" value={a.overallStatus.replace(/_/g, ' ')} />
        <Row label="Items" value={`${a.openItems} open / ${a.totalItems} total`} />
        <Row label="Blocked" value={String(a.blockedItems)} />
        <Row label="Overdue" value={String(a.overdueItems)} />
        <Text style={styles.disclaimer}>{a.disclaimer}</Text>
      </>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Home</Text>
          <Text style={styles.subtitle}>Read-only organization summary</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Session</Text>
          <Row label="Role" value={user?.role ?? '—'} />
          <Text style={styles.hint}>User and org IDs are intentionally omitted here; open the web app for full account details.</Text>
        </View>

        {loading && (
          <View style={styles.centered}>
            <ActivityIndicator size="large" />
            <Text style={styles.muted}>Loading readiness…</Text>
          </View>
        )}

        {!loading && error && (
          <View style={styles.card}>
            <Text style={styles.errorTitle}>Could not load summary</Text>
            <Text style={styles.unavailable}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => void load()}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {!loading && payload && (
          <>
            <SectionCard title="Organization">{renderOrg(payload.org)}</SectionCard>
            <SectionCard title="Compliance calendar">{renderCompliance(payload.compliance)}</SectionCard>
            <SectionCard title="Governance">{renderGovernance(payload.governance)}</SectionCard>
            <SectionCard title="Restricted funds">{renderRestricted(payload.restrictedFunds)}</SectionCard>
            <SectionCard title="Audit prep">{renderAudit(payload.auditPrep)}</SectionCard>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Not on mobile (v1)</Text>
              <Text style={styles.bulletList}>
                • Full interactive dashboards and charts{'\n'}• Editing records, workflows, and uploads{'\n'}• Partner
                portfolio and institutional views{'\n'}• Form 990 readiness drill-down and narrative tools{'\n'}• Cash flow
                forecast and detailed financial views{'\n'}• Grant CRM and worker income tools
              </Text>
              <Text style={styles.footerStrong}>Mobile v1 is read-only summary only; use the web app for workflows and full dashboards.</Text>
            </View>

            <View style={styles.footer}>
              <Text style={styles.footerText}>{payload.caveat}</Text>
            </View>
          </>
        )}
      </ScrollView>
      <TabBar />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    paddingBottom: 24,
  },
  header: {
    backgroundColor: '#fff',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
  card: {
    backgroundColor: '#fff',
    margin: 16,
    marginBottom: 0,
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    gap: 12,
  },
  label: {
    fontSize: 14,
    color: '#666',
    flexShrink: 0,
    maxWidth: '42%',
  },
  value: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    flex: 1,
    textAlign: 'right',
  },
  unavailable: {
    fontSize: 14,
    color: '#8b6914',
    lineHeight: 20,
  },
  disclaimer: {
    marginTop: 12,
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
    lineHeight: 18,
  },
  hint: {
    marginTop: 8,
    fontSize: 12,
    color: '#888',
    lineHeight: 18,
  },
  centered: {
    padding: 32,
    alignItems: 'center',
  },
  muted: {
    marginTop: 8,
    fontSize: 14,
    color: '#888',
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    color: '#c00',
  },
  retryBtn: {
    marginTop: 16,
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: '#007AFF',
    borderRadius: 8,
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
  },
  bulletList: {
    fontSize: 14,
    color: '#555',
    lineHeight: 22,
  },
  footerStrong: {
    marginTop: 16,
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    lineHeight: 20,
  },
  footer: {
    padding: 20,
    paddingTop: 8,
  },
  footerText: {
    fontSize: 12,
    color: '#777',
    lineHeight: 18,
  },
});
