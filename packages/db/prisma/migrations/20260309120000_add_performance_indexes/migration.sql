CREATE INDEX idx_worker_org_workerId ON "WorkerOrgRelationship"("workerId");
CREATE INDEX idx_worker_org_orgId ON "WorkerOrgRelationship"("orgId");
CREATE INDEX idx_worker_org_grantId ON "WorkerOrgRelationship"("grantId");
CREATE INDEX idx_income_sourceOrgId ON "IncomeTransaction"("sourceOrgId");
