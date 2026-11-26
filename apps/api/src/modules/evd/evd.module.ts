import { Module } from '@nestjs/common';
import {
  ClaimEvidenceController,
  EvidenceController,
  EvidenceFilesController,
  FootageRequestsController,
  PublicClaimEvidenceController,
  RefillEvidenceController,
} from './evd.http.js';
import { EvdQueries } from './evd.queries.js';
import { EvdService } from './evd.service.js';

/**
 * Bằng chứng camera an ninh (ADR-0032). Không import module nghiệp vụ nào: hồ sơ đích (phiếu khiếu
 * nại, phiếu nạp) chỉ được đọc trong EvdQueries; ORD đếm bằng chứng bằng truy vấn đọc chéo của nó, nên
 * không có vòng ORD ↔ EVD. AlrService và kho tệp là @Global.
 */
@Module({
  controllers: [
    ClaimEvidenceController,
    RefillEvidenceController,
    FootageRequestsController,
    EvidenceController,
    PublicClaimEvidenceController,
    EvidenceFilesController,
  ],
  providers: [EvdQueries, EvdService],
  exports: [EvdService],
})
export class EvdModule {}
