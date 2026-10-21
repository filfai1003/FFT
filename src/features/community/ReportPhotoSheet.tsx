import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { REPORT_REASONS, type ReportReason } from '@/domain/community-look';
import { useToastStore } from '@/lib/toast-store';
import { useReportPhoto } from './api';

/** Whose photo is reported: the member and the photo the reporter saw. */
export type ReportTarget = { publicId: string; name: string; photo: string };

/**
 * Confirms a report of a member's profile photo (DECISIONS 120), with an optional reason. The
 * member never learns who reported it; three members' reports hide the photo until it is reviewed.
 */
export function ReportPhotoSheet({
  target,
  onClose,
}: {
  target: ReportTarget | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const report = useReportPhoto();
  const showToast = useToastStore((s) => s.show);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const close = () => {
    setReason(null);
    onClose();
  };

  const send = async () => {
    if (!target) return;
    try {
      const status = await report.mutateAsync({
        publicId: target.publicId,
        photo: target.photo,
        reason,
      });
      close();
      // No Undo here, on purpose (the one exception to "every important action can be undone"):
      // a report taken back at once would let anyone hide a photo for a moment and withdraw before
      // a review, and the count that hides a photo (3 members) must stay honest. The sheet asks
      // first instead, and a report never deletes anything: an admin decides.
      showToast({
        message:
          status === 'reported'
            ? t('report.sent')
            : status === 'already'
              ? t('report.already')
              : t('report.gone'),
      });
    } catch (e) {
      const code = (e as { code?: string }).code;
      showToast({ message: code === '54000' ? t('report.tooMany') : t('report.failed') });
    }
  };

  return (
    <Sheet
      visible={target != null}
      onClose={close}
      title={t('report.title')}
      closeLabel={t('common.close')}
      footer={
        <View style={{ gap: 8 }}>
          <Button
            size="large"
            variant="dark"
            icon="shield"
            label={t('report.send')}
            loading={report.isPending}
            disabled={report.isPending}
            onPress={() => void send()}
          />
          <Button variant="secondary" label={t('common.cancel')} onPress={close} />
        </View>
      }
    >
      <Text muted>{t('report.body', { name: target?.name ?? '' })}</Text>
      <Text variant="body" semibold accessibilityRole="header">
        {t('report.reasonTitle')}
      </Text>
      <View
        accessibilityRole="radiogroup"
        style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}
      >
        {REPORT_REASONS.map((r) => (
          <Chip
            key={r}
            role="radio"
            label={t(`report.reasons.${r}`)}
            selected={reason === r}
            // Optional: tapping the chosen reason again leaves none.
            onPress={() => setReason(reason === r ? null : r)}
          />
        ))}
      </View>
    </Sheet>
  );
}
