"use client";

import { useState, useEffect } from "react";
import { Shield, AlertCircle, RotateCw } from "lucide-react";
import { Tabs, Tab, Spinner, Button } from "@heroui/react";
import Image from "next/image";
import type { Network, AuditResults } from "../lib/types";
import { runAudit } from "../lib/audit";
import { CurrentStateTable } from "../components/audit/CurrentStateTable";
import { HistoryTable } from "../components/audit/HistoryTable";
import { ThemeSwitcher } from "../components/ThemeSwitcher";
import { RotationBatchModal } from "../components/batch/RotationBatchModal";

export default function Home() {
  const [network, setNetwork] = useState<Network>("mainnet");
  const [isLoading, setIsLoading] = useState(true);
  const [results, setResults] = useState<AuditResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState<string>("current");
  const [showBatchModal, setShowBatchModal] = useState(false);

  // Auto-audit on mount and network change
  useEffect(() => {
    const performAudit = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Audit ALL contracts on the network
        const auditResults = await runAudit(network);
        setResults(auditResults);
      } catch (err) {
        console.error("Audit failed:", err);
        setError(err instanceof Error ? err.message : "Audit failed");
      } finally {
        setIsLoading(false);
      }
    };

    performAudit();
  }, [network]);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-divider bg-content1/30 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Image
                src="/logo.png"
                alt="Vana RBAC Auditor Logo"
                width={32}
                height={32}
                className="h-8 w-8"
                priority
              />
              <h1 className="text-xl font-bold">Vana RBAC Auditor</h1>
            </div>

            {/* Network Selector as Tabs */}
            <div className="flex items-center gap-4">
              <Tabs
                selectedKey={network}
                onSelectionChange={(key) => setNetwork(key as Network)}
                size="sm"
                classNames={{
                  tabList: "bg-content2/50",
                }}
              >
                <Tab key="mainnet" title="Mainnet" />
                <Tab key="moksha" title="Moksha" />
              </Tabs>
              <Button
                size="sm"
                variant="flat"
                color="primary"
                startContent={<RotateCw className="h-4 w-4" />}
                onPress={() => setShowBatchModal(true)}
              >
                Generate Rotation Batch
              </Button>
              <ThemeSwitcher />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-6">
        {/* Error State */}
        {error && (
          <div className="mb-6 p-4 bg-danger/10 border border-danger rounded-lg flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-danger flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-danger">Audit Failed</p>
              <p className="text-sm text-foreground/70 mt-1">{error}</p>
            </div>
          </div>
        )}

        {/* Results Tabs */}
        <Tabs
          selectedKey={selectedTab}
          onSelectionChange={(key) => setSelectedTab(key as string)}
          fullWidth
          classNames={{
            tabList: "bg-content2/30",
            cursor: "bg-primary",
            tab: "data-[selected=true]:text-primary-foreground",
          }}
        >
          <Tab
            key="current"
            title={
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                <span>Current State</span>
                {!isLoading && results && (
                  <span className="text-xs opacity-70">
                    ({results.currentState.length})
                  </span>
                )}
              </div>
            }
          >
            <div className="mt-6">
              {isLoading ? (
                <div className="flex justify-center items-center py-12">
                  <Spinner size="lg" />
                  <span className="ml-3 text-default-500">
                    Loading permissions...
                  </span>
                </div>
              ) : error ? null : results ? (
                <CurrentStateTable
                  data={results.currentState}
                  network={network}
                  isLoading={false}
                />
              ) : null}
            </div>
          </Tab>

          <Tab
            key="history"
            title={
              <div className="flex items-center gap-2">
                <span>Audit Trail</span>
                {!isLoading && results && (
                  <span className="text-xs opacity-70">
                    ({results.history.length})
                  </span>
                )}
              </div>
            }
          >
            <div className="mt-6">
              {isLoading ? (
                <div className="flex justify-center items-center py-12">
                  <Spinner size="lg" />
                  <span className="ml-3 text-default-500">
                    Loading history...
                  </span>
                </div>
              ) : error ? null : results ? (
                <HistoryTable
                  data={results.history}
                  network={network}
                  isLoading={false}
                />
              ) : null}
            </div>
          </Tab>
        </Tabs>
      </main>

      {/* Batch Rotation Modal */}
      <RotationBatchModal
        isOpen={showBatchModal}
        onClose={() => setShowBatchModal(false)}
        network={network}
        auditResults={results ?? undefined}
      />
    </div>
  );
}
