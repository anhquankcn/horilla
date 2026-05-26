"""
0006_trial_kpi.py

- Add base_salary to TrialContract (mirrors PerformanceContract)
- ContractKPIAppendix: replace single performance FK with two nullable FKs
  (trial_contract + performance_contract) so both types support Phu luc 1
- Replace unique_together with partial UniqueConstraints
"""

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("payroll", "0005_contracts_hnh"),
    ]

    operations = [
        # 1. Add base_salary to TrialContract
        migrations.AddField(
            model_name="trialcontract",
            name="base_salary",
            field=models.FloatField(default=0, verbose_name="Lương hiệu suất (VND/tháng)"),
        ),

        # 2. Clear old unique_together on ContractKPIAppendix
        migrations.AlterUniqueTogether(
            name="contractkpiappendix",
            unique_together=set(),
        ),

        # 3. Remove old FK (contract -> PerformanceContract, 0 rows so safe)
        migrations.RemoveField(
            model_name="contractkpiappendix",
            name="contract",
        ),

        # 4. Add nullable FK to PerformanceContract
        migrations.AddField(
            model_name="contractkpiappendix",
            name="performance_contract",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="kpi_appendices",
                to="payroll.performancecontract",
                verbose_name="Hợp đồng Hiệu suất",
            ),
        ),

        # 5. Add nullable FK to TrialContract
        migrations.AddField(
            model_name="contractkpiappendix",
            name="trial_contract",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="kpi_appendices",
                to="payroll.trialcontract",
                verbose_name="Hợp đồng UAT PM",
            ),
        ),

        # 6. Add partial unique constraints
        migrations.AddConstraint(
            model_name="contractkpiappendix",
            constraint=models.UniqueConstraint(
                condition=models.Q(performance_contract__isnull=False),
                fields=["performance_contract", "year"],
                name="uq_perf_contract_year",
            ),
        ),
        migrations.AddConstraint(
            model_name="contractkpiappendix",
            constraint=models.UniqueConstraint(
                condition=models.Q(trial_contract__isnull=False),
                fields=["trial_contract", "year"],
                name="uq_trial_contract_year",
            ),
        ),
    ]
