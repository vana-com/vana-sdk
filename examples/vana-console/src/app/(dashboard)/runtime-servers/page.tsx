"use client";

import React, { useEffect, useState } from "react";
import {
  Card,
  CardBody,
  Button,
  Tabs,
  Tab,
  Input,
  Textarea,
} from "@heroui/react";
import { Server, Plus, RefreshCw, CheckCircle2, XCircle } from "lucide-react";
import { useRuntimeServers } from "@/hooks/useRuntimeServers";
import { useSDKConfig } from "@/providers/SDKConfigProvider";
import { EmptyState } from "@/components/ui/EmptyState";

/**
 * Runtime Servers Page
 *
 * Manage TEE runtime servers registered in the VanaRuntimeServers contract.
 * Provides functionality to view registered runtimes and register new ones.
 */
export default function RuntimeServersPage() {
  const { effectiveAddress } = useSDKConfig();
  const {
    // State
    runtimeServers,
    isLoadingRuntimeServers,
    isRegisteringRuntime,
    registerRuntimeError,

    // Form state
    runtimeAddress,
    publicKey,
    escrowedPrivateKey,
    runtimeUrl,

    // Actions
    loadRuntimeServers,
    handleRegisterRuntime,
    setRuntimeAddress,
    setPublicKey,
    setEscrowedPrivateKey,
    setRuntimeUrl,
    setRegisterRuntimeError,
  } = useRuntimeServers();

  const [activeTab, setActiveTab] = useState<string>("runtimes");

  // Load runtime servers on mount
  useEffect(() => {
    if (effectiveAddress) {
      loadRuntimeServers();
    }
  }, [effectiveAddress, loadRuntimeServers]);

  const handleSubmitRegistration = async () => {
    setRegisterRuntimeError("");
    await handleRegisterRuntime();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            Runtime Servers
          </h1>
          <p className="text-default-500 mt-1">
            Manage TEE runtime servers for secure data processing
          </p>
        </div>
      </div>

      {/* Main Content */}
      <Card>
        <CardBody className="p-0">
          <Tabs
            aria-label="Runtime server management"
            selectedKey={activeTab}
            onSelectionChange={(key) => {
              setActiveTab(key as string);
            }}
            classNames={{
              tabList: "w-full relative rounded-none",
              cursor: "w-full",
              tab: "max-w-fit px-6 h-12",
              tabContent: "group-data-[selected=true]:text-primary",
            }}
          >
            {/* Registered Runtimes Tab */}
            <Tab
              key="runtimes"
              title={
                <div className="flex items-center gap-2">
                  <Server className="h-4 w-4" />
                  <span>Registered Runtimes</span>
                </div>
              }
            >
              <div className="p-6 space-y-4">
                {/* Refresh Button */}
                <div className="flex justify-end">
                  <Button
                    color="default"
                    variant="flat"
                    startContent={<RefreshCw className="h-4 w-4" />}
                    onPress={loadRuntimeServers}
                    isLoading={isLoadingRuntimeServers}
                  >
                    Refresh
                  </Button>
                </div>

                {/* Runtime Servers List */}
                {isLoadingRuntimeServers ? (
                  <div className="text-center py-8 text-default-500">
                    Loading runtime servers...
                  </div>
                ) : runtimeServers.length === 0 ? (
                  <EmptyState
                    icon={<Server className="h-12 w-12" />}
                    title="No runtime servers registered"
                    description="Register your first runtime server to get started"
                    action={
                      <Button
                        color="primary"
                        variant="flat"
                        startContent={<Plus className="h-4 w-4" />}
                        onPress={() => {
                          setActiveTab("register");
                        }}
                      >
                        Register Runtime
                      </Button>
                    }
                  />
                ) : (
                  <div className="space-y-4">
                    {runtimeServers.map((runtime, index) => (
                      <Card key={index} className="border border-divider">
                        <CardBody className="p-4">
                          <div className="space-y-3">
                            {/* Runtime Address */}
                            <div>
                              <p className="text-xs text-default-500 mb-1">
                                Runtime Address
                              </p>
                              <p className="text-sm font-mono break-all">
                                {runtime.runtimeAddress}
                              </p>
                            </div>

                            {/* URL */}
                            <div>
                              <p className="text-xs text-default-500 mb-1">
                                URL
                              </p>
                              <p className="text-sm break-all">{runtime.url}</p>
                            </div>

                            {/* Owner */}
                            <div>
                              <p className="text-xs text-default-500 mb-1">
                                Owner
                              </p>
                              <p className="text-sm font-mono break-all">
                                {runtime.owner}
                              </p>
                            </div>

                            {/* Public Key */}
                            <div>
                              <p className="text-xs text-default-500 mb-1">
                                Public Key
                              </p>
                              <p className="text-sm font-mono break-all text-default-400">
                                {runtime.publicKey.substring(0, 32)}...
                              </p>
                            </div>
                          </div>
                        </CardBody>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </Tab>

            {/* Register Runtime Tab */}
            <Tab
              key="register"
              title={
                <div className="flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  <span>Register Runtime</span>
                </div>
              }
            >
              <div className="p-6 space-y-6">
                <div className="space-y-4">
                  {/* Info Card */}
                  <Card className="bg-default-100 border-none">
                    <CardBody className="p-4">
                      <p className="text-sm text-default-700">
                        Register a new TEE runtime server to enable secure data
                        processing. You'll need the runtime's address, public
                        key, escrowed private key, and URL.
                      </p>
                    </CardBody>
                  </Card>

                  {/* Registration Form */}
                  <div className="space-y-4">
                    {/* Runtime Address */}
                    <Input
                      label="Runtime Address"
                      placeholder="0x..."
                      value={runtimeAddress}
                      onValueChange={setRuntimeAddress}
                      variant="bordered"
                      isRequired
                      description="The Ethereum address of the runtime server"
                    />

                    {/* Public Key */}
                    <Textarea
                      label="Public Key"
                      placeholder="0x04..."
                      value={publicKey}
                      onValueChange={setPublicKey}
                      variant="bordered"
                      isRequired
                      minRows={2}
                      description="The runtime's public key (uncompressed format)"
                    />

                    {/* Escrowed Private Key */}
                    <Textarea
                      label="Escrowed Private Key"
                      placeholder="0x..."
                      value={escrowedPrivateKey}
                      onValueChange={setEscrowedPrivateKey}
                      variant="bordered"
                      isRequired
                      minRows={3}
                      description="The runtime's private key encrypted with PGE's public key"
                    />

                    {/* Runtime URL */}
                    <Input
                      label="Runtime URL"
                      placeholder="https://runtime.example.com"
                      value={runtimeUrl}
                      onValueChange={setRuntimeUrl}
                      variant="bordered"
                      isRequired
                      description="The HTTP(S) endpoint of the runtime server"
                    />
                  </div>

                  {/* Error Display */}
                  {registerRuntimeError && (
                    <Card className="bg-danger-50 border-danger">
                      <CardBody className="p-4">
                        <div className="flex items-start gap-3">
                          <XCircle className="h-5 w-5 text-danger flex-shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <p className="font-medium text-danger">
                              Registration Failed
                            </p>
                            <p className="text-sm text-danger-600 mt-1">
                              {registerRuntimeError}
                            </p>
                          </div>
                        </div>
                      </CardBody>
                    </Card>
                  )}

                  {/* Submit Button */}
                  <Button
                    color="primary"
                    size="lg"
                    className="w-full"
                    onPress={handleSubmitRegistration}
                    isLoading={isRegisteringRuntime}
                    isDisabled={
                      !runtimeAddress ||
                      !publicKey ||
                      !escrowedPrivateKey ||
                      !runtimeUrl
                    }
                    startContent={
                      !isRegisteringRuntime && (
                        <CheckCircle2 className="h-5 w-5" />
                      )
                    }
                  >
                    {isRegisteringRuntime
                      ? "Registering..."
                      : "Register Runtime"}
                  </Button>
                </div>
              </div>
            </Tab>
          </Tabs>
        </CardBody>
      </Card>
    </div>
  );
}
