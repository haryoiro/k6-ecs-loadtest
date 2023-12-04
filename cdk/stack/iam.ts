import * as cdk from "aws-cdk-lib"
import * as iam from "aws-cdk-lib/aws-iam"

export class IamStack extends cdk.Stack {
    constructor(scope, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        // IAM ロールの作成
        const role = new iam.Role(this, 'MyRole', {
            assumedBy: new iam.AccountRootPrincipal(), // このロールはアカウントのルートユーザーによって引き受けられます。
            description: 'An example IAM role',
        });

        // IAM ユーザーの作成
        const user = new iam.User(this, 'MyUser', {
            userName: 'my-user',
        });

        // ロールをユーザーにアタッチ
        user.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess'));
    }
}
